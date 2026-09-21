/**
 * Service Présences — gère les sessions de présence et l'enregistrement
 *
 * Sécurité : chaque opération vérifie que :
 * - La session appartient à l'enseignant connecté
 * - La classe est bien assignée à l'enseignant
 * - L'étudiant appartient à une classe de l'enseignant
 * - La session est en statut ACTIVE pour enregistrer des présences
 */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DemarrerSessionDto } from './dto/demarrer-session.dto';
import { EnregistrerPresenceDto } from './dto/enregistrer-presence.dto';
import { ModifierPresenceDto } from './dto/modifier-presence.dto';
import { SessionResolverService } from '../../sessions/session-resolver.service';

@Injectable()
export class PresencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionResolver: SessionResolverService,
  ) {}

  /**
   * Démarre une session de présence
   * L'enseignant doit avoir une affectation sur la classe + matière
   * @param enseignantId Identifiant de l'enseignant
   * @param dto Données de la session
   */
  async demarrerSession(enseignantId: string, dto: DemarrerSessionDto) {
    // Vérifie que l'enseignant a bien une affectation pour cette classe + matière
    const assignment = await this.prisma.assignment.findUnique({
      where: {
        teacherId_subjectId_classId: {
          teacherId: enseignantId,
          subjectId: dto.subjectId,
          classId: dto.classId,
        },
      },
    });

    if (!assignment) {
      throw new ForbiddenException(
        'Vous n\'êtes pas autorisé à créer une session pour cette classe et ce cours',
      );
    }

    const enseignant = await this.prisma.teacher.findUnique({
      where: { id: enseignantId },
      select: { establishmentId: true },
    });
    if (!enseignant) {
      throw new NotFoundException('Enseignant introuvable');
    }

    // Anti-doublon : le chef de classe a pu déjà ouvrir cette même séance
    // (POST /api/sessions). On la rejoint plutôt que d'en créer une seconde,
    // vide, pour le même cours — sinon les présences déjà scannées par les
    // étudiants du chef n'apparaîtraient jamais côté enseignant.
    const { session, creee } = await this.sessionResolver.trouverOuCreer({
      classId: dto.classId,
      subjectId: dto.subjectId,
      teacherId: enseignantId,
      room: dto.room,
      date: dto.date,
      startTime: dto.startTime,
      endTime: dto.endTime,
      establishmentId: enseignant.establishmentId,
    });

    // L'enseignant qui démarre son cours active la séance, même si le chef
    // ne l'avait que programmée.
    if (session.status === 'SCHEDULED') {
      await this.prisma.classSession.update({
        where: { id: session.id },
        data: { status: 'ACTIVE' },
      });
    }

    return { ...session, rejointe: !creee };
  }

  /**
   * Enregistre une présence/absence/retard pour un étudiant
   * @param enseignantId Identifiant de l'enseignant
   * @param sessionId Identifiant de la session
   * @param dto Données de présence
   */
  async enregistrerPresence(
    enseignantId: string,
    sessionId: string,
    dto: EnregistrerPresenceDto,
  ) {
    // Vérifie que la session appartient à l'enseignant et est active
    const session = await this.verifierSessionEnseignant(enseignantId, sessionId);

    if (session.status !== 'ACTIVE') {
      throw new BadRequestException(
        'La session n\'est pas active. Vous ne pouvez plus enregistrer de présences.',
      );
    }

    // Vérifie que l'étudiant appartient à la classe de la session
    const etudiant = await this.prisma.student.findFirst({
      where: {
        id: dto.studentId,
        classId: session.classId,
        status: 'active',
      },
    });

    if (!etudiant) {
      throw new ForbiddenException(
        'Cet étudiant n\'appartient pas à la classe de cette session',
      );
    }

    // Vérifie s'il existe déjà un enregistrement (upsert)
    const presence = await this.prisma.attendanceRecord.upsert({
      where: {
        sessionId_studentId: {
          sessionId: sessionId,
          studentId: dto.studentId,
        },
      },
      create: {
        sessionId: sessionId,
        studentId: dto.studentId,
        status: dto.status,
        scannedAt: dto.status === 'absent' ? null : new Date(),
      },
      update: {
        status: dto.status,
        scannedAt: dto.status === 'absent' ? null : new Date(),
        rejectionReason: null,
      },
    });

    return presence;
  }

  /**
   * Enregistre une absence pour un étudiant
   * @param enseignantId Identifiant de l'enseignant
   * @param sessionId Identifiant de la session
   * @param dto Données (studentId)
   */
  async enregistrerAbsence(
    enseignantId: string,
    sessionId: string,
    studentId: string,
  ) {
    return this.enregistrerPresence(enseignantId, sessionId, {
      sessionId,
      studentId,
      status: 'absent',
    });
  }

  /**
   * Enregistre un retard pour un étudiant
   * @param enseignantId Identifiant de l'enseignant
   * @param sessionId Identifiant de la session
   * @param studentId Identifiant de l'étudiant
   */
  async enregistrerRetard(
    enseignantId: string,
    sessionId: string,
    studentId: string,
  ) {
    return this.enregistrerPresence(enseignantId, sessionId, {
      sessionId,
      studentId,
      status: 'late',
    });
  }

  /**
   * Modifie une présence existante — uniquement si la session est active
   * et appartient à l'enseignant
   * @param enseignantId Identifiant de l'enseignant
   * @param presenceId Identifiant de l'enregistrement de présence
   * @param dto Nouvelles données
   */
  async modifierPresence(
    enseignantId: string,
    presenceId: string,
    dto: ModifierPresenceDto,
  ) {
    const presence = await this.prisma.attendanceRecord.findUnique({
      where: { id: presenceId },
      include: { session: true },
    });

    if (!presence) {
      throw new NotFoundException('Enregistrement de présence introuvable');
    }

    // Vérifie que la session appartient à l'enseignant
    if (presence.session.teacherId !== enseignantId) {
      throw new ForbiddenException(
        'Vous n\'êtes pas autorisé à modifier cette présence',
      );
    }

    // Vérifie que la session est encore active
    if (presence.session.status !== 'ACTIVE') {
      throw new BadRequestException(
        'La session est clôturée. Vous ne pouvez plus modifier les présences.',
      );
    }

    const presenceModifiee = await this.prisma.attendanceRecord.update({
      where: { id: presenceId },
      data: {
        status: dto.status,
        scannedAt: dto.scannedAt ?? (dto.status === 'absent' ? null : new Date()),
        rejectionReason: null,
      },
    });

    return presenceModifiee;
  }

  /**
   * Clôture une session de présence
   * Après clôture, aucune modification n'est possible
   * @param enseignantId Identifiant de l'enseignant
   * @param sessionId Identifiant de la session
   */
  async cloturerSession(enseignantId: string, sessionId: string) {
    const session = await this.verifierSessionEnseignant(enseignantId, sessionId);

    if (session.status !== 'ACTIVE') {
      throw new BadRequestException(
        'La session n\'est pas active et ne peut pas être clôturée',
      );
    }

    // Marque automatiquement comme absents les étudiants sans enregistrement
    const etudiantsClasse = await this.prisma.student.findMany({
      where: { classId: session.classId, status: 'active' },
      select: { id: true },
    });

    const presencesExistantes = await this.prisma.attendanceRecord.findMany({
      where: { sessionId: sessionId },
      select: { studentId: true },
    });

    const etudiantsEnregistres = new Set(presencesExistantes.map((p) => p.studentId));
    const absentsAAjouter = etudiantsClasse
      .filter((e) => !etudiantsEnregistres.has(e.id))
      .map((e) => ({
        sessionId: sessionId,
        studentId: e.id,
        status: 'absent' as const,
      }));

    // Crée les absences manquantes
    if (absentsAAjouter.length > 0) {
      await this.prisma.attendanceRecord.createMany({
        data: absentsAAjouter,
      });
    }

    const sessionCloturee = await this.prisma.classSession.update({
      where: { id: sessionId },
      data: { status: 'CLOSED' },
      include: {
        class: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true, code: true } },
      },
    });

    return {
      ...sessionCloturee,
      absentsAutomatiques: absentsAAjouter.length,
    };
  }

  /**
   * Récupère une session active de l'enseignant avec les présences en cours
   * @param enseignantId Identifiant de l'enseignant
   * @param sessionId Identifiant de la session
   */
  async consulterSession(enseignantId: string, sessionId: string) {
    const session = await this.verifierSessionEnseignant(enseignantId, sessionId);

    const presences = await this.prisma.attendanceRecord.findMany({
      where: { sessionId: sessionId },
      include: {
        student: {
          select: { id: true, matricule: true, firstName: true, lastName: true },
        },
      },
      orderBy: { student: { lastName: 'asc' } },
    });

    return {
      ...session,
      attendanceRecords: presences,
    };
  }

  /**
   * Récupère les sessions actives de l'enseignant
   * @param enseignantId Identifiant de l'enseignant
   */
  async consulterSessionsActives(enseignantId: string) {
    return this.prisma.classSession.findMany({
      where: { teacherId: enseignantId, status: 'ACTIVE' },
      include: {
        class: { select: { id: true, name: true, level: true } },
        subject: { select: { id: true, name: true, code: true } },
      },
      orderBy: { date: 'desc' },
    });
  }

  /**
   * Méthode privée — vérifie qu'une session appartient à l'enseignant connecté
   * @param enseignantId Identifiant de l'enseignant
   * @param sessionId Identifiant de la session
   * @returns La session si elle appartient à l'enseignant
   */
  private async verifierSessionEnseignant(enseignantId: string, sessionId: string) {
    const session = await this.prisma.classSession.findUnique({
      where: { id: sessionId },
      include: {
        class: { select: { id: true, name: true, level: true } },
        subject: { select: { id: true, name: true, code: true } },
      },
    });

    if (!session) {
      throw new NotFoundException('Session introuvable');
    }

    if (session.teacherId !== enseignantId) {
      throw new ForbiddenException(
        'Vous n\'êtes pas autorisé à accéder à cette session',
      );
    }

    return session;
  }
}
