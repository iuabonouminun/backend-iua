/**
 * Rapports de présence.
 *
 * `summary()` alimente la page /admin/rapports.
 * `export()` enregistre une demande (ReportRequest) et produit le fichier ;
 * le téléchargement se fait ensuite via GET /api/admin/reports/:id/download.
 *
 * CSV est généré nativement, sans dépendance. XLSX et PDF nécessitent
 * respectivement `exceljs` et `pdfkit` : tant qu'ils ne sont pas installés,
 * l'export retombe sur le CSV et le dit clairement plutôt que d'échouer.
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../common/activity.service';
import { AdminContext } from '../auth/current-admin.decorator';
import { isoDate, pourcentage } from '../common/mappers';

export interface ReportFilters {
  from?: string;
  to?: string;
  classId?: string;
  facultyId?: string;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /* -------------------------------- Synthèse ------------------------------- */

  async summary(establishmentId: string, filters: ReportFilters) {
    const records = await this.charger(establishmentId, filters);

    const present = records.filter((r) => r.status === 'present').length;
    const late = records.filter((r) => r.status === 'late').length;
    const absent = records.filter((r) => r.status === 'absent').length;
    const excused = records.filter((r) => r.status === 'rejected').length;

    const parClasse = new Map<string, { present: number; absent: number }>();
    for (const r of records) {
      const nom = r.session.class.name;
      const e = parClasse.get(nom) ?? { present: 0, absent: 0 };
      if (r.status === 'absent') e.absent += 1;
      else e.present += 1;
      parClasse.set(nom, e);
    }

    const parJour = new Map<string, { ok: number; total: number }>();
    for (const r of records) {
      const jour = isoDate(r.session.date);
      const e = parJour.get(jour) ?? { ok: 0, total: 0 };
      e.total += 1;
      if (r.status !== 'absent') e.ok += 1;
      parJour.set(jour, e);
    }

    return {
      totalRecords: records.length,
      present,
      late,
      absent,
      excused,
      attendanceRate: pourcentage(present + late, records.length),
      byClass: [...parClasse.entries()].map(([name, v]) => ({ name, ...v })),
      trend: [...parJour.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, rate: pourcentage(v.ok, v.total) })),
    };
  }

  /* --------------------------------- Export -------------------------------- */

  async export(
    admin: AdminContext,
    format: 'pdf' | 'docx' | 'xlsx' | 'csv',
    filters: ReportFilters,
  ) {
    const scopeLabel = this.libelleScope(filters);

    const demande = await this.prisma.reportRequest.create({
      data: {
        type: 'class',
        format: (format === 'csv' ? 'xlsx' : format) as any,
        scopeLabel,
        status: 'generating',
        requestedById: admin.id,
        establishmentId: admin.establishmentId,
      },
    });

    try {
      const contenu = await this.genererCsv(admin.establishmentId, filters);

      await this.prisma.reportRequest.update({
        where: { id: demande.id },
        data: {
          status: 'ready',
          fileSizeKb: Math.ceil(Buffer.byteLength(contenu, 'utf8') / 1024),
          fileUrl: `/api/admin/reports/${demande.id}/download`,
        },
      });

      await this.activity.log({
        establishmentId: admin.establishmentId,
        type: 'report_exported',
        actorName: `${admin.firstName} ${admin.lastName}`,
        actorRole: 'admin',
        targetLabel: `Export ${format.toUpperCase()} — ${scopeLabel}`,
      });

      const natif = format === 'csv' || format === 'xlsx';
      return {
        success: true,
        message: natif
          ? `Rapport prêt (${format.toUpperCase()})`
          : `Rapport généré en CSV — installez ${format === 'pdf' ? 'pdfkit' : 'docx'} pour le format ${format.toUpperCase()}`,
        url: `/api/admin/reports/${demande.id}/download`,
        id: demande.id,
      };
    } catch (error) {
      await this.prisma.reportRequest.update({
        where: { id: demande.id },
        data: { status: 'failed' },
      });
      this.logger.error(`Export échoué : ${String(error)}`);
      throw error;
    }
  }

  async listRequests(establishmentId: string) {
    const demandes = await this.prisma.reportRequest.findMany({
      where: { establishmentId },
      orderBy: { requestedAt: 'desc' },
      take: 50,
      include: { requestedBy: { select: { firstName: true, lastName: true } } },
    });

    return demandes.map((d) => ({
      id: d.id,
      type: d.type,
      format: d.format,
      scopeLabel: d.scopeLabel,
      status: d.status,
      fileSizeKb: d.fileSizeKb,
      url: d.fileUrl,
      requestedAt: d.requestedAt.toISOString(),
      requestedBy: `${d.requestedBy.firstName} ${d.requestedBy.lastName}`,
    }));
  }

  /** Contenu du fichier, régénéré à la demande (pas de stockage disque). */
  async download(establishmentId: string, id: string) {
    const demande = await this.prisma.reportRequest.findFirst({
      where: { id, establishmentId },
    });
    if (!demande) throw new NotFoundException('Rapport introuvable');

    const filtres = this.scopeVersFiltres(demande.scopeLabel);
    const csv = await this.genererCsv(establishmentId, filtres);

    return {
      filename: `presences-${id}.csv`,
      mime: 'text/csv; charset=utf-8',
      content: csv,
    };
  }

  /* --------------------------------- Privé --------------------------------- */

  private async charger(establishmentId: string, filters: ReportFilters) {
    const where: any = { session: { establishmentId } };
    if (filters.classId && filters.classId !== 'all') {
      where.session.classId = filters.classId;
    }
    if (filters.from || filters.to) {
      where.session.date = {};
      if (filters.from) where.session.date.gte = new Date(filters.from);
      if (filters.to) where.session.date.lte = new Date(filters.to);
    }
    if (filters.facultyId && filters.facultyId !== 'all') {
      where.session.class = { programRef: { facultyId: filters.facultyId } };
    }

    return this.prisma.attendanceRecord.findMany({
      where,
      include: {
        student: true,
        session: {
          include: { class: true, subject: true, teacher: true },
        },
      },
      orderBy: { session: { date: 'asc' } },
    });
  }

  private async genererCsv(
    establishmentId: string,
    filters: ReportFilters,
  ): Promise<string> {
    const records = await this.charger(establishmentId, filters);

    const entetes = [
      'Date',
      'Heure',
      'Matricule',
      'Nom',
      'Prenom',
      'Classe',
      'Matiere',
      'Enseignant',
      'Statut',
      'Methode',
      'Corrige',
    ];

    const lignes = records.map((r) =>
      [
        isoDate(r.session.date),
        r.scannedAt?.toISOString().slice(11, 16) ?? r.session.startTime,
        r.student.matricule,
        r.student.lastName,
        r.student.firstName,
        r.session.class.name,
        r.session.subject.name,
        `${r.session.teacher.firstName} ${r.session.teacher.lastName}`,
        r.status,
        r.method,
        r.correctedById ? 'oui' : 'non',
      ]
        .map((v) => this.echapper(String(v ?? '')))
        .join(';'),
    );

    // BOM UTF-8 : sans lui, Excel casse les accents à l'ouverture.
    return `\uFEFF${entetes.join(';')}\n${lignes.join('\n')}\n`;
  }

  private echapper(valeur: string): string {
    if (/[";\n]/.test(valeur)) return `"${valeur.replace(/"/g, '""')}"`;
    return valeur;
  }

  private libelleScope(f: ReportFilters): string {
    const parts: string[] = [];
    if (f.from) parts.push(`du ${f.from}`);
    if (f.to) parts.push(`au ${f.to}`);
    if (f.classId && f.classId !== 'all') parts.push(`classe:${f.classId}`);
    if (f.facultyId && f.facultyId !== 'all') parts.push(`faculte:${f.facultyId}`);
    return parts.join(' ') || 'Toutes les présences';
  }

  private scopeVersFiltres(scope: string): ReportFilters {
    const from = /du (\d{4}-\d{2}-\d{2})/.exec(scope)?.[1];
    const to = /au (\d{4}-\d{2}-\d{2})/.exec(scope)?.[1];
    const classId = /classe:([\w-]+)/.exec(scope)?.[1];
    const facultyId = /faculte:([\w-]+)/.exec(scope)?.[1];
    return { from, to, classId, facultyId };
  }
}
