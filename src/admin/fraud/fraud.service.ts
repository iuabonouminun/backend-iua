/**
 * Anti-fraude — orchestration.
 *
 * - runDetection() : charge les pointages de la période, applique les règles,
 *   enregistre les nouvelles alertes (idempotent grâce à `signature`).
 * - list() / stats() : ce que consomme la page /admin/fraude.
 * - review() : l'admin confirme, écarte ou clôt une alerte, avec possibilité
 *   d'invalider la présence frauduleuse dans le même mouvement. Toute revue
 *   est tracée dans le journal d'activité.
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../common/activity.service';
import { AdminSettingsService } from '../settings/admin-settings.service';
import { ReviewAlertDto, RunDetectionDto } from '../dto/admin.dto';
import { AdminContext } from '../auth/current-admin.decorator';
import {
  AlerteCandidate,
  POIDS_SEVERITE,
  RecordVue,
  Severite,
  detecterFraudes,
} from './fraud.rules';

const FENETRE_PAR_DEFAUT_JOURS = 30;

@Injectable()
export class FraudService {
  private readonly logger = new Logger(FraudService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly settings: AdminSettingsService,
  ) {}

  /* ------------------------------ Détection ------------------------------ */

  async runDetection(establishmentId: string, dto: RunDetectionDto = {}) {
    const parametres = await this.settings.getRaw(establishmentId);

    if (!parametres.fraudDetectionEnabled) {
      return {
        success: false,
        message: 'La détection de fraude est désactivée dans les paramètres.',
        nouvelles: 0,
        analysees: 0,
      };
    }

    const to = dto.to ? new Date(dto.to) : new Date();
    const from = dto.from
      ? new Date(dto.from)
      : new Date(to.getTime() - FENETRE_PAR_DEFAUT_JOURS * 86_400_000);

    const records = (await this.prisma.attendanceRecord.findMany({
      where: {
        session: {
          establishmentId,
          date: { gte: this.jour(from), lte: this.jour(to) },
        },
      },
      select: {
        id: true,
        sessionId: true,
        studentId: true,
        status: true,
        method: true,
        scannedAt: true,
        deviceFingerprint: true,
        ipAddress: true,
        latitude: true,
        longitude: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            matricule: true,
            status: true,
            classId: true,
          },
        },
        session: {
          select: {
            id: true,
            date: true,
            startTime: true,
            endTime: true,
            room: true,
            status: true,
            qrRegenerations: true,
            classId: true,
            subject: { select: { name: true } },
            teacher: { select: { firstName: true, lastName: true } },
          },
        },
      },
    })) as unknown as RecordVue[];

    const candidates = detecterFraudes(records, {
      campusLatitude: parametres.campusLatitude,
      campusLongitude: parametres.campusLongitude,
      campusRadiusMeters: parametres.campusRadiusMeters,
      maxDevicesPerStudent: parametres.maxDevicesPerStudent,
      maxQrRegenerations: parametres.maxQrRegenerations,
      burstScanWindowSeconds: parametres.burstScanWindowSeconds,
      burstScanThreshold: parametres.burstScanThreshold,
      lateToleranceMinutes: parametres.lateToleranceMinutes,
    });

    const nouvelles = await this.enregistrer(establishmentId, candidates);

    this.logger.log(
      `Détection ${establishmentId} : ${records.length} pointages analysés, ${candidates.length} signaux, ${nouvelles} nouvelles alertes`,
    );

    return {
      success: true,
      message: `${nouvelles} nouvelle(s) alerte(s) sur ${records.length} pointage(s) analysé(s)`,
      nouvelles,
      analysees: records.length,
      periode: {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
      },
    };
  }

  /** createMany + skipDuplicates : la contrainte unique sur signature fait le tri. */
  private async enregistrer(
    establishmentId: string,
    candidates: AlerteCandidate[],
  ): Promise<number> {
    if (!candidates.length) return 0;

    const result = await this.prisma.fraudAlert.createMany({
      data: candidates.map((c) => ({
        signature: c.signature,
        type: c.type as any,
        severity: c.severity as any,
        title: c.title,
        description: c.description,
        evidence: c.evidence as any,
        establishmentId,
        sessionId: c.sessionId ?? null,
        studentId: c.studentId ?? null,
        attendanceRecordId: c.attendanceRecordId ?? null,
      })),
      skipDuplicates: true,
    });

    return result.count;
  }

  /* -------------------------------- Lecture ------------------------------- */

  async list(
    establishmentId: string,
    filters: {
      status?: string;
      severity?: string;
      type?: string;
      studentId?: string;
      sessionId?: string;
      limit?: number;
    },
  ) {
    const where: any = { establishmentId };
    if (filters.status) where.status = filters.status;
    if (filters.severity) where.severity = filters.severity;
    if (filters.type) where.type = filters.type;
    if (filters.studentId) where.studentId = filters.studentId;
    if (filters.sessionId) where.sessionId = filters.sessionId;

    const alertes = await this.prisma.fraudAlert.findMany({
      where,
      orderBy: [{ status: 'asc' }, { detectedAt: 'desc' }],
      take: Math.min(Number(filters.limit) || 200, 500),
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            matricule: true,
            class: { select: { id: true, name: true } },
          },
        },
        session: {
          select: {
            id: true,
            date: true,
            startTime: true,
            endTime: true,
            room: true,
            subject: { select: { name: true } },
            class: { select: { name: true } },
            teacher: { select: { firstName: true, lastName: true } },
          },
        },
        reviewedBy: { select: { firstName: true, lastName: true } },
      },
    });

    return alertes.map((a) => ({
      id: a.id,
      type: a.type,
      severity: a.severity,
      status: a.status,
      title: a.title,
      description: a.description,
      evidence: a.evidence,
      detectedAt: a.detectedAt.toISOString(),
      reviewedAt: a.reviewedAt?.toISOString() ?? null,
      reviewNote: a.reviewNote,
      reviewedBy: a.reviewedBy
        ? `${a.reviewedBy.firstName} ${a.reviewedBy.lastName}`
        : null,
      student: a.student
        ? {
            id: a.student.id,
            name: `${a.student.firstName} ${a.student.lastName}`,
            matricule: a.student.matricule,
            className: a.student.class?.name ?? '',
          }
        : null,
      session: a.session
        ? {
            id: a.session.id,
            subjectName: a.session.subject.name,
            className: a.session.class.name,
            teacherName: `${a.session.teacher.firstName} ${a.session.teacher.lastName}`,
            date: a.session.date.toISOString().slice(0, 10),
            startTime: a.session.startTime,
            endTime: a.session.endTime,
            room: a.session.room,
          }
        : null,
      attendanceRecordId: a.attendanceRecordId,
    }));
  }

  async getById(establishmentId: string, id: string) {
    const [alerte] = await this.list(establishmentId, { limit: 500 }).then((l) =>
      l.filter((a) => a.id === id),
    );
    if (!alerte) throw new NotFoundException('Alerte introuvable');
    return alerte;
  }

  /** Bandeau de la page /admin/fraude + carte du tableau de bord. */
  async stats(establishmentId: string) {
    const alertes = await this.prisma.fraudAlert.findMany({
      where: { establishmentId },
      select: {
        severity: true,
        status: true,
        type: true,
        detectedAt: true,
        studentId: true,
      },
    });

    const ouvertes = alertes.filter((a) => a.status === 'OPEN');
    const confirmees = alertes.filter((a) => a.status === 'CONFIRMED');

    const parType = new Map<string, number>();
    for (const a of ouvertes) {
      parType.set(a.type, (parType.get(a.type) ?? 0) + 1);
    }

    const parSeverite: Record<Severite, number> = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0,
    };
    for (const a of ouvertes) parSeverite[a.severity as Severite] += 1;

    /**
     * Indice de risque 0-100 : somme pondérée des alertes ouvertes, plafonnée.
     * Sert de voyant unique sur le tableau de bord.
     */
    const score = ouvertes.reduce(
      (acc, a) => acc + POIDS_SEVERITE[a.severity as Severite],
      0,
    );
    const indiceRisque = Math.min(100, score);

    const il7jours = Date.now() - 7 * 86_400_000;
    const etudiantsConcernes = new Set(
      alertes.filter((a) => a.studentId).map((a) => a.studentId),
    );

    return {
      total: alertes.length,
      ouvertes: ouvertes.length,
      confirmees: confirmees.length,
      ecartees: alertes.filter((a) => a.status === 'DISMISSED').length,
      resolues: alertes.filter((a) => a.status === 'RESOLVED').length,
      derniers7Jours: alertes.filter(
        (a) => a.detectedAt.getTime() >= il7jours,
      ).length,
      parSeverite,
      parType: [...parType.entries()]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      etudiantsConcernes: etudiantsConcernes.size,
      indiceRisque,
    };
  }

  /* --------------------------------- Revue -------------------------------- */

  async review(admin: AdminContext, id: string, dto: ReviewAlertDto) {
    const alerte = await this.prisma.fraudAlert.findFirst({
      where: { id, establishmentId: admin.establishmentId },
    });
    if (!alerte) throw new NotFoundException('Alerte introuvable');

    const maj = await this.prisma.fraudAlert.update({
      where: { id },
      data: {
        status: dto.status as any,
        reviewNote: dto.note ?? null,
        reviewedAt: new Date(),
        reviewedById: admin.id,
      },
    });

    // Confirmation d'une fraude : la présence litigieuse est invalidée.
    let presenceInvalidee = false;
    if (
      dto.status === 'CONFIRMED' &&
      dto.invalidateAttendance &&
      alerte.attendanceRecordId
    ) {
      await this.prisma.attendanceRecord.update({
        where: { id: alerte.attendanceRecordId },
        data: {
          status: 'rejected',
          rejectionReason: 'other',
          correctedById: admin.id,
          correctedAt: new Date(),
          correctionNote: `Présence invalidée suite à l'alerte ${alerte.type} (${id})`,
        },
      });
      presenceInvalidee = true;
    }

    await this.activity.log({
      establishmentId: admin.establishmentId,
      type: 'fraud_alert_reviewed',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: `Alerte ${alerte.type} → ${dto.status}${presenceInvalidee ? ' (présence invalidée)' : ''}${dto.note ? ` — ${dto.note}` : ''}`,
    });

    return {
      success: true,
      message: MESSAGES_REVUE[dto.status],
      alerte: { id: maj.id, status: maj.status },
      presenceInvalidee,
    };
  }

  /** Dossier fraude d'un étudiant — utilisé sur la fiche /admin/etudiants/[id]. */
  async byStudent(establishmentId: string, studentId: string) {
    return this.list(establishmentId, { studentId, limit: 100 });
  }

  private jour(d: Date): Date {
    const copie = new Date(d);
    copie.setUTCHours(0, 0, 0, 0);
    return copie;
  }
}

const MESSAGES_REVUE: Record<string, string> = {
  CONFIRMED: 'Fraude confirmée',
  DISMISSED: 'Alerte écartée (faux positif)',
  RESOLVED: 'Alerte clôturée',
};
