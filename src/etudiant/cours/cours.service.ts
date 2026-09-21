import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CoursService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Récupère les séances (passées et à venir) de la classe de l'étudiant,
   * au format attendu par student-app (CourseSummary[]).
   */
  async consulterCours(etudiantId: string) {
    const etudiant = await this.prisma.student.findUnique({
      where: { id: etudiantId },
    });
    if (!etudiant) {
      throw new NotFoundException('Étudiant introuvable');
    }

    const sessions = await this.prisma.classSession.findMany({
      where: { classId: etudiant.classId },
      include: {
        subject: { select: { name: true } },
        teacher: { select: { firstName: true, lastName: true } },
      },
      orderBy: { date: 'desc' },
    });

    return sessions.map((s) => ({
      id: s.id,
      matiere: s.subject.name,
      enseignant: `${s.teacher.firstName} ${s.teacher.lastName}`,
      salle: s.room,
      date: s.date.toISOString().slice(0, 10),
      heureDebut: s.startTime,
      heureFin: s.endTime,
    }));
  }
}
