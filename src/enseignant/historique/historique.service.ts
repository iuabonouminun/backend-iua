/**
 * Service Historique — gère l'historique des sessions, présences, absences et retards
 * L'enseignant ne voit que l'historique de SES sessions
 */
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionStatus } from '@prisma/client';

@Injectable()
export class HistoriqueService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Récupère l'historique des sessions de l'enseignant
   * @param enseignantId Identifiant de l'enseignant
   * @param filtre Statut optionnel (CLOSED, ACTIVE, etc.)
   */
  async historiqueSessions(enseignantId: string, filtre?: string) {
    const where: { teacherId: string; status?: SessionStatus } = { teacherId: enseignantId };
    if (filtre) {
      where.status = filtre as SessionStatus;
    }

    const sessions = await this.prisma.classSession.findMany({
      where,
      include: {
        class: { select: { id: true, name: true, level: true } },
        subject: { select: { id: true, name: true, code: true } },
        _count: {
          select: {
            attendanceRecords: {
              where: { status: 'present' },
            },
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    return sessions.map((s) => ({
      id: s.id,
      date: s.date,
      horaire: { debut: s.startTime, fin: s.endTime },
      salle: s.room,
      status: s.status,
      class: s.class,
      subject: s.subject,
      presencesCount: s._count?.attendanceRecords ?? 0,
    }));
  }

  /**
   * Récupère l'historique des présences (une ligne par élève présent),
   * dans la même forme que absences/retards pour que le frontend puisse
   * afficher les 4 onglets avec le même composant.
   * @param enseignantId Identifiant de l'enseignant
   * @param classeId Identifiant de la classe (optionnel)
   */
  async presencesParClasse(enseignantId: string, classeId?: string) {
    // Si une classe est spécifiée, vérifie que l'enseignant y est assigné
    if (classeId) {
      const assignment = await this.prisma.assignment.findFirst({
        where: { teacherId: enseignantId, classId: classeId },
      });
      if (!assignment) {
        throw new ForbiddenException(
          'Vous n\'êtes pas autorisé à consulter les présences de cette classe',
        );
      }
    }

    const sessions = await this.prisma.classSession.findMany({
      where: {
        teacherId: enseignantId,
        ...(classeId ? { classId: classeId } : {}),
      },
      include: {
        class: { select: { id: true, name: true, level: true } },
        subject: { select: { id: true, name: true, code: true } },
        attendanceRecords: {
          where: { status: 'present' },
          include: {
            student: {
              select: { id: true, matricule: true, firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    return sessions.flatMap((s) =>
      s.attendanceRecords.map((r) => ({
        id: r.id,
        date: s.date,
        class: s.class,
        subject: s.subject,
        student: r.student,
        status: r.status,
      })),
    );
  }

  /**
   * Récupère l'historique des absences
   * @param enseignantId Identifiant de l'enseignant
   * @param classeId Identifiant de la classe (optionnel)
   */
  async historiqueAbsences(enseignantId: string, classeId?: string) {
    const sessions = await this.prisma.classSession.findMany({
      where: {
        teacherId: enseignantId,
        ...(classeId ? { classId: classeId } : {}),
      },
      select: { id: true },
    });

    const sessionIds = sessions.map((s) => s.id);

    const absences = await this.prisma.attendanceRecord.findMany({
      where: {
        sessionId: { in: sessionIds },
        status: 'absent',
      },
      include: {
        student: {
          select: { id: true, matricule: true, firstName: true, lastName: true, classId: true },
        },
        session: {
          select: {
            id: true,
            date: true,
            startTime: true,
            subject: { select: { id: true, name: true, code: true } },
            class: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { session: { date: 'desc' } },
    });

    return absences.map((a) => ({
      id: a.id,
      date: a.session.date,
      class: a.session.class,
      subject: a.session.subject,
      student: a.student,
      status: a.status,
    }));
  }

  /**
   * Récupère l'historique des retards
   * @param enseignantId Identifiant de l'enseignant
   * @param classeId Identifiant de la classe (optionnel)
   */
  async historiqueRetards(enseignantId: string, classeId?: string) {
    const sessions = await this.prisma.classSession.findMany({
      where: {
        teacherId: enseignantId,
        ...(classeId ? { classId: classeId } : {}),
      },
      select: { id: true },
    });

    const sessionIds = sessions.map((s) => s.id);

    const retards = await this.prisma.attendanceRecord.findMany({
      where: {
        sessionId: { in: sessionIds },
        status: 'late',
      },
      include: {
        student: {
          select: { id: true, matricule: true, firstName: true, lastName: true },
        },
        session: {
          select: {
            id: true,
            date: true,
            startTime: true,
            subject: { select: { id: true, name: true, code: true } },
            class: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { session: { date: 'desc' } },
    });

    return retards.map((r) => ({
      id: r.id,
      date: r.session.date,
      class: r.session.class,
      subject: r.session.subject,
      student: r.student,
      status: r.status,
    }));
  }
}
