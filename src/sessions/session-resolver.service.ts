/**
 * Résolution de séance — anti-doublon.
 *
 * Le bug silencieux le plus grave du système actuel : il existe DEUX chemins
 * de création de séance pour un même cours.
 *
 *   - le chef de classe :  POST /api/sessions
 *   - l'enseignant :       POST /api/enseignant/sessions-presence
 *
 * Aucun des deux ne vérifie si l'autre a déjà créé la séance. Scénario réel :
 * le chef ouvre le pointage à 8h00, les 40 étudiants scannent. L'enseignant
 * arrive, clique sur « démarrer la session » dans son application, et obtient
 * une DEUXIÈME séance, vide. Il voit 0 présent sur un cours plein, imprime une
 * feuille où tout le monde est absent, et le taux de présence de la classe est
 * faussé pour la matière.
 *
 * Ce service donne une règle unique : pour un couple
 * (classe, matière, date, heure de début), il n'existe qu'une seule séance.
 * Qui arrive en premier la crée, le second la rejoint.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CleSeance {
  classId: string;
  subjectId: string;
  teacherId: string;
  date: Date | string;
  startTime: string;
  endTime: string;
  room: string;
  establishmentId: string;
}

/**
 * Tolérance sur l'heure de début : le chef peut ouvrir à 08:00 et
 * l'enseignant saisir 08:05. Sans cette marge, la règle ne servirait à rien
 * en pratique.
 */
const TOLERANCE_MINUTES = 30;

@Injectable()
export class SessionResolverService {
  private readonly logger = new Logger(SessionResolverService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Renvoie la séance existante correspondante, ou la crée.
   * `creee` indique lequel des deux cas s'est produit — utile pour adapter le
   * message renvoyé à l'utilisateur ("séance ouverte" vs "séance rejointe").
   */
  async trouverOuCreer(cle: CleSeance) {
    const jour = this.jour(cle.date);
    const existante = await this.chercher(cle, jour);

    if (existante) {
      this.logger.log(
        `Séance existante rejointe : ${existante.id} (${cle.startTime})`,
      );

      // La séance a pu être créée par le chef en SCHEDULED : l'arrivée de
      // l'enseignant ne doit pas la refermer, mais peut l'activer.
      return { session: existante, creee: false };
    }

    const expectedCount = await this.prisma.student.count({
      where: { classId: cle.classId, status: 'active' },
    });

    const session = await this.prisma.classSession.create({
      data: {
        classId: cle.classId,
        subjectId: cle.subjectId,
        teacherId: cle.teacherId,
        room: cle.room,
        date: jour,
        startTime: cle.startTime,
        endTime: cle.endTime,
        status: 'SCHEDULED',
        expectedCount,
        establishmentId: cle.establishmentId,
      },
      include: {
        class: { select: { id: true, name: true, level: true } },
        subject: { select: { id: true, name: true, code: true } },
        teacher: { select: { firstName: true, lastName: true } },
      },
    });

    return { session, creee: true };
  }

  /**
   * Cherche une séance équivalente du même jour, sur la même classe et la
   * même matière, dont l'heure de début tombe dans la fenêtre de tolérance.
   */
  private async chercher(cle: CleSeance, jour: Date) {
    const candidates = await this.prisma.classSession.findMany({
      where: {
        classId: cle.classId,
        subjectId: cle.subjectId,
        date: jour,
        status: { notIn: ['CANCELLED'] },
      },
      include: {
        class: { select: { id: true, name: true, level: true } },
        subject: { select: { id: true, name: true, code: true } },
        teacher: { select: { firstName: true, lastName: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    const vise = this.minutes(cle.startTime);
    if (vise === null) return candidates[0] ?? null;

    return (
      candidates.find((c) => {
        const debut = this.minutes(c.startTime);
        return debut !== null && Math.abs(debut - vise) <= TOLERANCE_MINUTES;
      }) ?? null
    );
  }

  private jour(d: Date | string): Date {
    const copie = new Date(d);
    copie.setUTCHours(0, 0, 0, 0);
    return copie;
  }

  private minutes(hhmm: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm?.trim() ?? '');
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }
}
