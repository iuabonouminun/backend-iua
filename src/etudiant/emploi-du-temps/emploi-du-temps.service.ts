import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const JOURS = [
  '',
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
  'Dimanche',
];

@Injectable()
export class EmploiDuTempsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Récupère l'emploi du temps hebdomadaire de la classe de l'étudiant,
   * au format attendu par student-app (ScheduleEntry[]).
   */
  async consulterEmploiDuTemps(etudiantId: string) {
    const etudiant = await this.prisma.student.findUnique({
      where: { id: etudiantId },
    });
    if (!etudiant) {
      throw new NotFoundException('Étudiant introuvable');
    }

    const entries = await this.prisma.scheduleEntry.findMany({
      where: { classId: etudiant.classId },
      include: {
        subject: { select: { name: true } },
        teacher: { select: { firstName: true, lastName: true } },
        room: { select: { name: true } },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    return entries.map((e) => ({
      id: e.id,
      jour: JOURS[e.dayOfWeek] ?? String(e.dayOfWeek),
      dayOfWeek: e.dayOfWeek,
      heureDebut: e.startTime,
      heureFin: e.endTime,
      matiere: e.subject.name,
      subjectId: e.subjectId,
      enseignant: `${e.teacher.firstName} ${e.teacher.lastName}`,
      teacherId: e.teacherId,
      salle: e.room.name,
    }));
  }
}
