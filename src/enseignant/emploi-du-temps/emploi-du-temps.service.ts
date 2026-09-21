/**
 * Service Emploi du Temps — gère la consultation de l'emploi du temps de l'enseignant
 * Permet de filtrer par jour ou par semaine
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EmploiDuTempsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Récupère l'emploi du temps complet de l'enseignant
   * @param enseignantId Identifiant de l'enseignant
   */
  async consulterEmploiDuTemps(enseignantId: string) {
    const enseignant = await this.prisma.teacher.findUnique({
      where: { id: enseignantId },
    });
    if (!enseignant) {
      throw new NotFoundException('Enseignant introuvable');
    }

    const entries = await this.prisma.scheduleEntry.findMany({
      where: { teacherId: enseignantId },
      include: {
        class: { select: { id: true, name: true, level: true } },
        subject: { select: { id: true, name: true, code: true } },
        room: { select: { name: true } },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    return entries.map((e) => ({
      id: e.id,
      dayOfWeek: e.dayOfWeek,
      startTime: e.startTime,
      endTime: e.endTime,
      room: e.room.name,
      class: e.class,
      subject: e.subject,
      conflict: e.conflict,
    }));
  }

  /**
   * Filtre l'emploi du temps par jour de la semaine
   * @param enseignantId Identifiant de l'enseignant
   * @param jour Numéro du jour (1 = lundi ... 7 = dimanche)
   */
  async filtrerParJour(enseignantId: string, jour: number) {
    const entries = await this.prisma.scheduleEntry.findMany({
      where: { teacherId: enseignantId, dayOfWeek: jour },
      include: {
        class: { select: { id: true, name: true, level: true } },
        subject: { select: { id: true, name: true, code: true } },
        room: { select: { name: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    return entries.map((e) => ({
      id: e.id,
      dayOfWeek: e.dayOfWeek,
      startTime: e.startTime,
      endTime: e.endTime,
      room: e.room.name,
      class: e.class,
      subject: e.subject,
      conflict: e.conflict,
    }));
  }

  /**
   * Filtre l'emploi du temps par semaine (numéro de jour de début et de fin)
   * @param enseignantId Identifiant de l'enseignant
   * @param jourDebut Jour de début (1-7)
   * @param jourFin Jour de fin (1-7)
   */
  async filtrerParSemaine(enseignantId: string, jourDebut: number, jourFin: number) {
    const entries = await this.prisma.scheduleEntry.findMany({
      where: {
        teacherId: enseignantId,
        dayOfWeek: { gte: jourDebut, lte: jourFin },
      },
      include: {
        class: { select: { id: true, name: true, level: true } },
        subject: { select: { id: true, name: true, code: true } },
        room: { select: { name: true } },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    return entries.map((e) => ({
      id: e.id,
      dayOfWeek: e.dayOfWeek,
      startTime: e.startTime,
      endTime: e.endTime,
      room: e.room.name,
      class: e.class,
      subject: e.subject,
      conflict: e.conflict,
    }));
  }
}
