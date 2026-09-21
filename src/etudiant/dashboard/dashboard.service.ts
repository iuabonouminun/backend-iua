import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async consulterDashboard(etudiantId: string) {
    const etudiant = await this.prisma.student.findUnique({
      where: { id: etudiantId },
      include: {
        class: { select: { id: true, name: true, level: true, program: true } },
        establishment: { select: { id: true, name: true } },
      },
    });
    if (!etudiant) {
      throw new NotFoundException('Étudiant introuvable');
    }

    const debutJour = new Date();
    debutJour.setHours(0, 0, 0, 0);
    const finJour = new Date();
    finJour.setHours(23, 59, 59, 999);

    const [coursDuJour, prochainCours, tousLesRecords] = await Promise.all([
      this.prisma.classSession.findMany({
        where: {
          classId: etudiant.classId,
          date: { gte: debutJour, lte: finJour },
        },
        include: {
          subject: { select: { name: true } },
          teacher: { select: { firstName: true, lastName: true } },
        },
        orderBy: { startTime: 'asc' },
      }),
      this.prisma.classSession.findFirst({
        where: {
          classId: etudiant.classId,
          status: { in: ['SCHEDULED', 'ACTIVE'] },
          date: { gte: debutJour },
        },
        include: {
          subject: { select: { name: true } },
          teacher: { select: { firstName: true, lastName: true } },
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.attendanceRecord.findMany({
        where: { studentId: etudiantId },
        select: { status: true },
      }),
    ]);

    const total = tousLesRecords.length;
    const presences = tousLesRecords.filter((r) => r.status === 'present').length;
    const retards = tousLesRecords.filter((r) => r.status === 'late').length;
    const absences = tousLesRecords.filter((r) => r.status === 'absent').length;

    return {
      user: {
        externalUserId: etudiant.externalUserId,
        nom: etudiant.lastName,
        prenom: etudiant.firstName,
        email: etudiant.email,
        matricule: etudiant.matricule,
        classe: etudiant.class.name,
        filiere: etudiant.class.program,
        niveau: etudiant.class.level,
        etablissement: etudiant.establishment.name,
      },
      prochainCours: prochainCours
        ? {
            id: prochainCours.id,
            matiere: prochainCours.subject.name,
            enseignant: `${prochainCours.teacher.firstName} ${prochainCours.teacher.lastName}`,
            salle: prochainCours.room,
            date: prochainCours.date.toISOString().slice(0, 10),
            heureDebut: prochainCours.startTime,
            heureFin: prochainCours.endTime,
          }
        : null,
      coursDuJour: coursDuJour.map((c) => ({
        id: c.id,
        matiere: c.subject.name,
        enseignant: `${c.teacher.firstName} ${c.teacher.lastName}`,
        salle: c.room,
        date: c.date.toISOString().slice(0, 10),
        heureDebut: c.startTime,
        heureFin: c.endTime,
      })),
      stats: {
        totalSeances: total,
        presences,
        absences,
        retards,
        tauxPresence: total > 0 ? Math.round((presences / total) * 100) : 0,
      },
    };
  }
}
