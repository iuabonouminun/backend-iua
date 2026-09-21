/**
 * Feuille de présence de l'enseignant.
 *
 * Ce que l'enseignant attend réellement, et qui manquait :
 *
 *  1. La liste COMPLÈTE de sa classe, pas seulement ceux qui ont scanné.
 *     Une feuille de présence qui n'affiche que les présents est inutilisable :
 *     l'information dont on a besoin en cours, c'est qui manque.
 *     D'où le principe retenu ici : on part de l'effectif de la classe et on
 *     y rattache les pointages, jamais l'inverse.
 *
 *  2. Un document imprimable. Les administrations demandent une feuille papier
 *     signée, avec une colonne d'émargement. Le HTML généré est calibré A4 et
 *     s'imprime directement (Ctrl+P), sans dépendance PDF à installer.
 *
 *  3. Un récapitulatif par classe ET par cours sur une période : la matrice
 *     étudiants × séances, avec le taux de présence de chacun. C'est ce
 *     tableau qui sert pour les conseils de classe et les exclusions pour
 *     absentéisme.
 */
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface FiltresRecapitulatif {
  classId: string;
  subjectId?: string;
  from?: string;
  to?: string;
}

const LIBELLES_STATUT: Record<string, string> = {
  present: 'Présent',
  late: 'Retard',
  absent: 'Absent',
  rejected: 'Rejeté',
};

@Injectable()
export class FeuillePresenceService {
  constructor(private readonly prisma: PrismaService) {}

  /* ===================== Feuille d'une séance ========================== */

  async feuilleSeance(enseignantId: string, sessionId: string) {
    const session = await this.prisma.classSession.findUnique({
      where: { id: sessionId },
      include: {
        subject: true,
        class: true,
        teacher: true,
        establishment: { select: { name: true } },
      },
    });
    if (!session) throw new NotFoundException('Séance introuvable');

    if (session.teacherId !== enseignantId) {
      throw new ForbiddenException("Cette séance n'est pas la vôtre");
    }

    // On part de l'effectif de la classe, pas des pointages.
    const [etudiants, pointages] = await Promise.all([
      this.prisma.student.findMany({
        where: { classId: session.classId, status: 'active' },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: {
          id: true,
          matricule: true,
          firstName: true,
          lastName: true,
        },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { sessionId },
        select: {
          id: true,
          studentId: true,
          status: true,
          scannedAt: true,
          method: true,
          correctedById: true,
        },
      }),
    ]);

    const parEtudiant = new Map(pointages.map((p) => [p.studentId, p]));

    const lignes = etudiants.map((e, index) => {
      const p = parEtudiant.get(e.id);
      return {
        numero: index + 1,
        studentId: e.id,
        matricule: e.matricule,
        nom: e.lastName,
        prenom: e.firstName,
        // Aucun pointage du tout = non pointé, ce qui n'est pas la même chose
        // qu'une absence constatée après clôture.
        statut: p?.status ?? 'non_pointe',
        libelleStatut: p ? LIBELLES_STATUT[p.status] : 'Non pointé',
        heure: p?.scannedAt?.toTimeString().slice(0, 5) ?? null,
        methode: p?.method ?? null,
        corrige: !!p?.correctedById,
        attendanceId: p?.id ?? null,
      };
    });

    const compte = (statut: string) =>
      lignes.filter((l) => l.statut === statut).length;

    const presents = compte('present');
    const retards = compte('late');

    return {
      seance: {
        id: session.id,
        etablissement: session.establishment?.name ?? '',
        matiere: session.subject.name,
        codeMatiere: session.subject.code,
        classe: session.class.name,
        niveau: session.class.level,
        enseignant: `${session.teacher.firstName} ${session.teacher.lastName}`,
        salle: session.room,
        date: session.date.toISOString().slice(0, 10),
        heureDebut: session.startTime,
        heureFin: session.endTime,
        statut: session.status,
      },
      statistiques: {
        effectif: lignes.length,
        presents,
        retards,
        absents: compte('absent'),
        nonPointes: compte('non_pointe'),
        presentsTotal: presents + retards,
        tauxPresence: lignes.length
          ? Math.round(((presents + retards) / lignes.length) * 100)
          : 0,
      },
      lignes,
    };
  }

  /* ====================== Récapitulatif période ========================= */

  async recapitulatif(enseignantId: string, filtres: FiltresRecapitulatif) {
    const where: any = {
      teacherId: enseignantId,
      classId: filtres.classId,
    };
    if (filtres.subjectId) where.subjectId = filtres.subjectId;
    if (filtres.from || filtres.to) {
      where.date = {};
      if (filtres.from) where.date.gte = new Date(filtres.from);
      if (filtres.to) where.date.lte = new Date(filtres.to);
    }

    const seances = await this.prisma.classSession.findMany({
      where,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      include: {
        subject: { select: { name: true, code: true } },
        class: { select: { name: true, level: true } },
        teacher: { select: { firstName: true, lastName: true } },
        establishment: { select: { name: true } },
        attendanceRecords: {
          select: { studentId: true, status: true },
        },
      },
    });

    if (seances.length === 0) {
      throw new NotFoundException(
        'Aucune séance de votre part sur cette classe pour cette période',
      );
    }

    const etudiants = await this.prisma.student.findMany({
      where: { classId: filtres.classId, status: 'active' },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, matricule: true, firstName: true, lastName: true },
    });

    // Index (etudiant, seance) -> statut, pour construire la matrice.
    const index = new Map<string, string>();
    for (const s of seances) {
      for (const r of s.attendanceRecords) {
        index.set(`${r.studentId}|${s.id}`, r.status);
      }
    }

    const lignes = etudiants.map((e, i) => {
      const cellules = seances.map((s) => {
        const statut = index.get(`${e.id}|${s.id}`) ?? 'non_pointe';
        return {
          sessionId: s.id,
          date: s.date.toISOString().slice(0, 10),
          statut,
          // Abréviation pour la matrice imprimée
          symbole:
            statut === 'present'
              ? 'P'
              : statut === 'late'
                ? 'R'
                : statut === 'absent'
                  ? 'A'
                  : '—',
        };
      });

      const presents = cellules.filter(
        (c) => c.statut === 'present' || c.statut === 'late',
      ).length;
      const absents = cellules.filter((c) => c.statut === 'absent').length;

      return {
        numero: i + 1,
        studentId: e.id,
        matricule: e.matricule,
        nom: e.lastName,
        prenom: e.firstName,
        cellules,
        presents,
        absents,
        tauxPresence: seances.length
          ? Math.round((presents / seances.length) * 100)
          : 0,
      };
    });

    const premiere = seances[0];

    return {
      entete: {
        etablissement: premiere.establishment?.name ?? '',
        classe: premiere.class.name,
        niveau: premiere.class.level,
        matiere: filtres.subjectId
          ? premiere.subject.name
          : 'Toutes mes matières',
        enseignant: `${premiere.teacher.firstName} ${premiere.teacher.lastName}`,
        periode: {
          du: filtres.from ?? seances[0].date.toISOString().slice(0, 10),
          au:
            filtres.to ??
            seances[seances.length - 1].date.toISOString().slice(0, 10),
        },
        nombreSeances: seances.length,
      },
      seances: seances.map((s) => ({
        id: s.id,
        date: s.date.toISOString().slice(0, 10),
        heureDebut: s.startTime,
        matiere: s.subject.name,
      })),
      lignes,
      // Repère utile en conseil de classe : qui passe sous la barre des 50 %.
      alertesAbsenteisme: lignes
        .filter((l) => l.tauxPresence < 50)
        .map((l) => ({
          matricule: l.matricule,
          nom: `${l.nom} ${l.prenom}`,
          tauxPresence: l.tauxPresence,
        })),
    };
  }

  /* ============================== Exports ============================== */

  async csvSeance(enseignantId: string, sessionId: string): Promise<string> {
    const f = await this.feuilleSeance(enseignantId, sessionId);

    const entetes = [
      'N°',
      'Matricule',
      'Nom',
      'Prenom',
      'Statut',
      'Heure',
      'Methode',
    ];
    const lignes = f.lignes.map((l) =>
      [
        l.numero,
        l.matricule,
        l.nom,
        l.prenom,
        l.libelleStatut,
        l.heure ?? '',
        l.methode ?? '',
      ]
        .map((v) => this.echapper(String(v ?? '')))
        .join(';'),
    );

    const entete = [
      `Feuille de presence`,
      `Etablissement;${f.seance.etablissement}`,
      `Classe;${f.seance.classe}`,
      `Matiere;${f.seance.matiere} (${f.seance.codeMatiere})`,
      `Enseignant;${f.seance.enseignant}`,
      `Date;${f.seance.date};${f.seance.heureDebut}-${f.seance.heureFin};Salle ${f.seance.salle}`,
      `Effectif;${f.statistiques.effectif};Presents;${f.statistiques.presentsTotal};Absents;${f.statistiques.absents}`,
      '',
    ].join('\n');

    // BOM UTF-8 : sans lui, Excel casse les accents.
    return `\uFEFF${entete}\n${entetes.join(';')}\n${lignes.join('\n')}\n`;
  }

  /**
   * Page HTML prête à imprimer (A4 portrait).
   * Pas de librairie PDF : le navigateur fait le rendu et l'export PDF.
   * L'enseignant ouvre, vérifie, imprime ou enregistre — un flux qu'il
   * maîtrise déjà, et zéro dépendance à maintenir côté serveur.
   */
  async htmlSeance(enseignantId: string, sessionId: string): Promise<string> {
    const f = await this.feuilleSeance(enseignantId, sessionId);

    const rangs = f.lignes
      .map(
        (l) => `
      <tr class="${l.statut === 'absent' ? 'absent' : ''}">
        <td class="num">${l.numero}</td>
        <td>${this.h(l.matricule)}</td>
        <td class="nom">${this.h(l.nom)} ${this.h(l.prenom)}</td>
        <td class="centre">${this.h(l.libelleStatut)}</td>
        <td class="centre">${l.heure ?? '—'}</td>
        <td class="emargement"></td>
      </tr>`,
      )
      .join('');

    return this.gabarit(
      `Feuille de présence — ${f.seance.classe}`,
      `
      <header>
        <div class="etab">${this.h(f.seance.etablissement)}</div>
        <h1>Feuille de présence</h1>
        <table class="meta">
          <tr>
            <td><strong>Classe</strong> ${this.h(f.seance.classe)} (${this.h(f.seance.niveau)})</td>
            <td><strong>Matière</strong> ${this.h(f.seance.matiere)} — ${this.h(f.seance.codeMatiere)}</td>
          </tr>
          <tr>
            <td><strong>Enseignant</strong> ${this.h(f.seance.enseignant)}</td>
            <td><strong>Salle</strong> ${this.h(f.seance.salle)}</td>
          </tr>
          <tr>
            <td><strong>Date</strong> ${f.seance.date}</td>
            <td><strong>Horaire</strong> ${f.seance.heureDebut} – ${f.seance.heureFin}</td>
          </tr>
        </table>
      </header>

      <div class="stats">
        <span><strong>${f.statistiques.effectif}</strong> inscrits</span>
        <span class="ok"><strong>${f.statistiques.presentsTotal}</strong> présents</span>
        <span class="warn"><strong>${f.statistiques.retards}</strong> retards</span>
        <span class="ko"><strong>${f.statistiques.absents}</strong> absents</span>
        <span><strong>${f.statistiques.tauxPresence}%</strong> de présence</span>
      </div>

      <table class="liste">
        <thead>
          <tr>
            <th class="num">N°</th>
            <th>Matricule</th>
            <th>Nom et prénoms</th>
            <th class="centre">Statut</th>
            <th class="centre">Heure</th>
            <th class="emargement">Émargement</th>
          </tr>
        </thead>
        <tbody>${rangs}</tbody>
      </table>

      <footer>
        <div class="signature">
          <p>Signature de l'enseignant</p>
          <div class="cadre"></div>
        </div>
        <div class="signature">
          <p>Visa de l'administration</p>
          <div class="cadre"></div>
        </div>
      </footer>
      `,
    );
  }

  async htmlRecapitulatif(
    enseignantId: string,
    filtres: FiltresRecapitulatif,
  ): Promise<string> {
    const r = await this.recapitulatif(enseignantId, filtres);

    const colonnes = r.seances
      .map((s) => `<th class="jour">${s.date.slice(5)}</th>`)
      .join('');

    const rangs = r.lignes
      .map(
        (l) => `
      <tr>
        <td class="num">${l.numero}</td>
        <td>${this.h(l.matricule)}</td>
        <td class="nom">${this.h(l.nom)} ${this.h(l.prenom)}</td>
        ${l.cellules
          .map(
            (c) =>
              `<td class="cell ${c.statut}">${c.symbole}</td>`,
          )
          .join('')}
        <td class="centre ${l.tauxPresence < 50 ? 'ko' : ''}"><strong>${l.tauxPresence}%</strong></td>
      </tr>`,
      )
      .join('');

    return this.gabarit(
      `Récapitulatif — ${r.entete.classe}`,
      `
      <header>
        <div class="etab">${this.h(r.entete.etablissement)}</div>
        <h1>Récapitulatif de présence</h1>
        <table class="meta">
          <tr>
            <td><strong>Classe</strong> ${this.h(r.entete.classe)} (${this.h(r.entete.niveau)})</td>
            <td><strong>Matière</strong> ${this.h(r.entete.matiere)}</td>
          </tr>
          <tr>
            <td><strong>Enseignant</strong> ${this.h(r.entete.enseignant)}</td>
            <td><strong>Période</strong> ${r.entete.periode.du} → ${r.entete.periode.au}
              (${r.entete.nombreSeances} séances)</td>
          </tr>
        </table>
      </header>

      <table class="liste matrice">
        <thead>
          <tr>
            <th class="num">N°</th>
            <th>Matricule</th>
            <th>Nom et prénoms</th>
            ${colonnes}
            <th class="centre">Taux</th>
          </tr>
        </thead>
        <tbody>${rangs}</tbody>
      </table>

      <p class="legende">
        <strong>P</strong> présent · <strong>R</strong> retard ·
        <strong>A</strong> absent · <strong>—</strong> non pointé
      </p>

      ${
        r.alertesAbsenteisme.length
          ? `<div class="alerte">
               <strong>Absentéisme (moins de 50 % de présence) :</strong>
               ${r.alertesAbsenteisme
                 .map(
                   (a) =>
                     `${this.h(a.matricule)} — ${this.h(a.nom)} (${a.tauxPresence}%)`,
                 )
                 .join(' · ')}
             </div>`
          : ''
      }

      <footer>
        <div class="signature">
          <p>Signature de l'enseignant</p>
          <div class="cadre"></div>
        </div>
      </footer>
      `,
    );
  }

  /* ============================== Privé ================================ */

  private gabarit(titre: string, corps: string): string {
    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${this.h(titre)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Arial, sans-serif;
    font-size: 11px; color: #111; margin: 0;
  }
  .barre-impression {
    position: sticky; top: 0; display: flex; gap: 8px;
    padding: 10px; background: #f3f4f6; border-bottom: 1px solid #d1d5db;
    margin-bottom: 16px;
  }
  .barre-impression button {
    padding: 8px 16px; border: 0; border-radius: 6px;
    background: #1d4ed8; color: #fff; font-size: 13px; cursor: pointer;
  }
  header { border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
  .etab { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; }
  h1 { font-size: 17px; margin: 4px 0 8px; }
  table.meta { width: 100%; font-size: 11px; border-collapse: collapse; }
  table.meta td { padding: 2px 0; }
  table.meta strong { display: inline-block; min-width: 76px; color: #555; font-weight: 600; }
  .stats {
    display: flex; gap: 18px; flex-wrap: wrap;
    padding: 7px 10px; background: #f8fafc;
    border: 1px solid #e2e8f0; border-radius: 5px; margin-bottom: 10px;
  }
  .stats .ok { color: #15803d; } .stats .warn { color: #b45309; } .stats .ko { color: #b91c1c; }
  table.liste { width: 100%; border-collapse: collapse; }
  table.liste th, table.liste td { border: 1px solid #cbd5e1; padding: 4px 6px; }
  table.liste th { background: #e2e8f0; font-size: 10px; text-transform: uppercase; letter-spacing: .3px; }
  table.liste tbody tr:nth-child(even) { background: #fafafa; }
  .num { width: 30px; text-align: center; color: #666; }
  .nom { font-weight: 600; }
  .centre { text-align: center; }
  .emargement { width: 130px; }
  tr.absent td { color: #b91c1c; }
  .ko { color: #b91c1c; }
  table.matrice td.cell { text-align: center; font-weight: 700; width: 26px; }
  td.cell.present { color: #15803d; }
  td.cell.late { color: #b45309; }
  td.cell.absent { color: #b91c1c; }
  td.cell.non_pointe { color: #94a3b8; }
  th.jour { width: 26px; font-size: 9px; }
  .legende { font-size: 10px; color: #555; margin-top: 8px; }
  .alerte {
    margin-top: 10px; padding: 8px 10px; font-size: 10px;
    border: 1px solid #fca5a5; background: #fef2f2; border-radius: 5px;
  }
  footer { display: flex; gap: 40px; margin-top: 26px; page-break-inside: avoid; }
  .signature { flex: 1; font-size: 10px; color: #555; }
  .signature .cadre { height: 56px; border: 1px solid #cbd5e1; border-radius: 4px; margin-top: 4px; }
  @media print {
    .barre-impression { display: none; }
    table.liste { page-break-inside: auto; }
    table.liste tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
  }
</style>
</head>
<body>
  <div class="barre-impression">
    <button onclick="window.print()">Imprimer / Enregistrer en PDF</button>
  </div>
  ${corps}
</body>
</html>`;
  }

  private h(v: string): string {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private echapper(v: string): string {
    if (/[";\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  }
}
