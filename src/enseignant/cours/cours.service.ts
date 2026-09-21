/**
 * Service Cours — gère la consultation des cours, classes et étudiants de l'enseignant
 * L'enseignant ne peut voir QUE les cours où il est assigné via Assignment
 */
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CoursService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Récupère tous les cours (matières) de l'enseignant connecté
   * @param enseignantId Identifiant de l'enseignant
   */
  async consulterCours(enseignantId: string) {
    // Récupère les matières via les liens TeacherSubject et les affectations Assignment
    const enseignant = await this.prisma.teacher.findUnique({
      where: { id: enseignantId },
      include: {
        subjectLinks: {
          include: {
            subject: {
              include: {
                assignments: {
                  where: { teacherId: enseignantId },
                  include: {
                    class: {
                      select: { id: true, name: true, level: true, studentCount: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!enseignant) {
      throw new NotFoundException('Enseignant introuvable');
    }

    return enseignant.subjectLinks.map((link) => ({
      id: link.subject.id,
      name: link.subject.name,
      code: link.subject.code,
      volumeHours: link.subject.volumeHours,
      classes: link.subject.assignments.map((a) => a.class),
    }));
  }

  /**
   * Récupère les détails d'un cours spécifique de l'enseignant
   * @param enseignantId Identifiant de l'enseignant
   * @param coursId Identifiant du cours (matière)
   */
  async consulterDetailsCours(enseignantId: string, coursId: string) {
    // Vérifie que l'enseignant est bien lié à cette matière
    const link = await this.prisma.teacherSubject.findUnique({
      where: {
        teacherId_subjectId: { teacherId: enseignantId, subjectId: coursId },
      },
    });

    if (!link) {
      throw new ForbiddenException('Vous n\'êtes pas autorisé à consulter ce cours');
    }

    const cours = await this.prisma.subject.findUnique({
      where: { id: coursId },
      include: {
        assignments: {
          where: { teacherId: enseignantId },
          include: {
            class: {
              select: {
                id: true,
                name: true,
                level: true,
                program: true,
                studentCount: true,
              },
            },
          },
        },
        scheduleEntries: {
          where: { teacherId: enseignantId },
          select: {
            id: true,
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            room: true,
          },
        },
      },
    });

    if (!cours) {
      throw new NotFoundException('Cours introuvable');
    }

    return cours;
  }

  /**
   * Récupère les classes associées à l'enseignant (via les affectations)
   * @param enseignantId Identifiant de l'enseignant
   */
  async consulterClasses(enseignantId: string) {
    const assignments = await this.prisma.assignment.findMany({
      where: { teacherId: enseignantId },
      include: {
        class: {
          select: {
            id: true,
            name: true,
            level: true,
            program: true,
            studentCount: true,
          },
        },
        subject: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    // Grouper par classe pour éviter les doublons
    const classesMap = new Map<string, { id: string; name: string; level: string; program: string; studentCount: number; matieres: { id: string; name: string; code: string }[] }>();

    for (const a of assignments) {
      const classe = classesMap.get(a.class.id) ?? {
        ...a.class,
        matieres: [],
      };
      classe.matieres.push(a.subject);
      classesMap.set(a.class.id, classe);
    }

    return Array.from(classesMap.values());
  }

  /**
   * Récupère les étudiants d'une classe spécifique
   * L'enseignant ne peut voir les étudiants que des classes où il est assigné
   * @param enseignantId Identifiant de l'enseignant
   * @param classeId Identifiant de la classe
   */
  async consulterEtudiantsClasse(enseignantId: string, classeId: string) {
    // Vérifie que l'enseignant a bien une affectation sur cette classe
    const assignment = await this.prisma.assignment.findFirst({
      where: { teacherId: enseignantId, classId: classeId },
    });

    if (!assignment) {
      throw new ForbiddenException('Vous n\'êtes pas autorisé à consulter les étudiants de cette classe');
    }

    const etudiants = await this.prisma.student.findMany({
      where: { classId: classeId, status: 'active' },
      select: {
        id: true,
        matricule: true,
        firstName: true,
        lastName: true,
        email: true,
        createdAt: true,
      },
      orderBy: { lastName: 'asc' },
    });

    return etudiants;
  }
}
