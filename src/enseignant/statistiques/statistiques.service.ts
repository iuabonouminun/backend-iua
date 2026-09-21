/**
 * Service Statistiques — calcule les taux de présence, absences et retards
 * Les statistiques sont calculées uniquement sur les sessions de l'enseignant
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StatistiquesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calcule les statistiques globales de l'enseignant
   * @param enseignantId Identifiant de l'enseignant
   */
  async statistiquesGlobales(enseignantId: string) {
    const sessions = await this.prisma.classSession.findMany({
      where: { teacherId: enseignantId, status: 'CLOSED' },
      select: { id: true },
    });

    const sessionIds = sessions.map((s) => s.id);

    const [presents, absents, retards, total] = await Promise.all([
      this.prisma.attendanceRecord.count({
        where: { sessionId: { in: sessionIds }, status: 'present' },
      }),
      this.prisma.attendanceRecord.count({
        where: { sessionId: { in: sessionIds }, status: 'absent' },
      }),
      this.prisma.attendanceRecord.count({
        where: { sessionId: { in: sessionIds }, status: 'late' },
      }),
      this.prisma.attendanceRecord.count({
        where: { sessionId: { in: sessionIds } },
      }),
    ]);

    const tauxPresence = total > 0 ? Math.round((presents / total) * 1000) / 10 : 0;
    const tauxAbsence = total > 0 ? Math.round((absents / total) * 1000) / 10 : 0;
    const tauxRetard = total > 0 ? Math.round((retards / total) * 1000) / 10 : 0;

    return {
      totalSessions: sessions.length,
      totalSeances: sessions.length,
      totalEnregistrements: total,
      presents,
      absents,
      totalAbsences: absents,
      retards,
      totalRetards: retards,
      tauxPresence,
      tauxAbsence,
      tauxRetard,
    };
  }

  /**
   * Calcule les statistiques par classe
   * @param enseignantId Identifiant de l'enseignant
   */
  async statistiquesParClasse(enseignantId: string) {
    const classes = await this.prisma.assignment.findMany({
      where: { teacherId: enseignantId },
      include: {
        class: { select: { id: true, name: true, level: true } },
      },
      distinct: ['classId'],
    });

    const resultats = await Promise.all(
      classes.map(async (a) => {
        const sessions = await this.prisma.classSession.findMany({
          where: { teacherId: enseignantId, classId: a.class.id, status: 'CLOSED' },
          select: { id: true },
        });

        const sessionIds = sessions.map((s) => s.id);

        const [presents, absents, retards, total] = await Promise.all([
          this.prisma.attendanceRecord.count({
            where: { sessionId: { in: sessionIds }, status: 'present' },
          }),
          this.prisma.attendanceRecord.count({
            where: { sessionId: { in: sessionIds }, status: 'absent' },
          }),
          this.prisma.attendanceRecord.count({
            where: { sessionId: { in: sessionIds }, status: 'late' },
          }),
          this.prisma.attendanceRecord.count({
            where: { sessionId: { in: sessionIds } },
          }),
        ]);

        return {
          name: a.class.name,
          classe: a.class,
          totalSessions: sessions.length,
          presents,
          absents,
          retards,
          total,
          tauxPresence: total > 0 ? Math.round((presents / total) * 1000) / 10 : 0,
          tauxAbsence: total > 0 ? Math.round((absents / total) * 1000) / 10 : 0,
          tauxRetard: total > 0 ? Math.round((retards / total) * 1000) / 10 : 0,
        };
      }),
    );

    return resultats;
  }

  /**
   * Calcule les statistiques par cours (matière)
   * @param enseignantId Identifiant de l'enseignant
   */
  async statistiquesParCours(enseignantId: string) {
    const liens = await this.prisma.teacherSubject.findMany({
      where: { teacherId: enseignantId },
      include: {
        subject: { select: { id: true, name: true, code: true } },
      },
    });

    const resultats = await Promise.all(
      liens.map(async (lien) => {
        const sessions = await this.prisma.classSession.findMany({
          where: { teacherId: enseignantId, subjectId: lien.subject.id, status: 'CLOSED' },
          select: { id: true },
        });

        const sessionIds = sessions.map((s) => s.id);

        const [presents, absents, retards, total] = await Promise.all([
          this.prisma.attendanceRecord.count({
            where: { sessionId: { in: sessionIds }, status: 'present' },
          }),
          this.prisma.attendanceRecord.count({
            where: { sessionId: { in: sessionIds }, status: 'absent' },
          }),
          this.prisma.attendanceRecord.count({
            where: { sessionId: { in: sessionIds }, status: 'late' },
          }),
          this.prisma.attendanceRecord.count({
            where: { sessionId: { in: sessionIds } },
          }),
        ]);

        return {
          name: lien.subject.name,
          matiere: lien.subject,
          totalSessions: sessions.length,
          presents,
          absents,
          retards,
          total,
          tauxPresence: total > 0 ? Math.round((presents / total) * 1000) / 10 : 0,
          tauxAbsence: total > 0 ? Math.round((absents / total) * 1000) / 10 : 0,
          tauxRetard: total > 0 ? Math.round((retards / total) * 1000) / 10 : 0,
        };
      }),
    );

    return resultats;
  }
}
