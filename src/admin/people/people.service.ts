/**
 * Gestion des accès — comptes étudiants et enseignants.
 *
 * C'est ici que l'administrateur ouvre, ferme et réinitialise les accès.
 * Trois principes tenus dans tout le fichier :
 *  1. On ne supprime jamais un compte qui a des présences : on le suspend.
 *     Supprimer effacerait l'historique et donc la preuve.
 *  2. Un mot de passe généré n'est affiché qu'une seule fois, jamais stocké
 *     en clair ni renvoyé par les lectures suivantes.
 *  3. Toute action est écrite au journal d'activité.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../common/activity.service';
import { AdminContext } from '../auth/current-admin.decorator';
import {
  isoDate,
  mapUserStatus,
  motDePasseTemporaire,
  pourcentage,
} from '../common/mappers';
import {
  AssignLeaderDto,
  CreateStudentDto,
  CreateTeacherDto,
  ResetPasswordDto,
  SuspendAccountDto,
  UpdateStudentDto,
  UpdateTeacherDto,
} from '../dto/admin.dto';

@Injectable()
export class PeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /* ================================ Étudiants =============================== */

  async listStudents(
    establishmentId: string,
    filters: { classId?: string; status?: string; search?: string } = {},
  ) {
    const where: any = { establishmentId };
    if (filters.classId) where.classId = filters.classId;
    if (filters.status) where.status = filters.status;
    if (filters.search) {
      where.OR = [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { matricule: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const etudiants = await this.prisma.student.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: {
        class: {
          include: {
            programRef: { include: { faculty: true } },
          },
        },
        attendanceRecords: { select: { status: true } },
      },
    });

    return etudiants.map((e) => this.mapStudent(e));
  }

  async getStudent(establishmentId: string, id: string) {
    const e = await this.prisma.student.findFirst({
      where: { id, establishmentId },
      include: {
        class: { include: { programRef: { include: { faculty: true } } } },
        attendanceRecords: { select: { status: true } },
      },
    });
    if (!e) throw new NotFoundException('Étudiant introuvable');
    return this.mapStudent(e);
  }

  /** Historique de présence détaillé de l'étudiant (fiche admin). */
  async getStudentAttendance(establishmentId: string, id: string) {
    const records = await this.prisma.attendanceRecord.findMany({
      where: { studentId: id, session: { establishmentId } },
      orderBy: { session: { date: 'desc' } },
      take: 200,
      include: {
        session: {
          include: {
            subject: { select: { name: true } },
            teacher: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    return records.map((r) => ({
      id: r.id,
      date: isoDate(r.session.date),
      time: r.scannedAt?.toISOString().slice(11, 16) ?? r.session.startTime,
      subjectName: r.session.subject.name,
      teacherName: `${r.session.teacher.firstName} ${r.session.teacher.lastName}`,
      status: r.status,
      method: r.method,
      corrected: !!r.correctedById,
    }));
  }

  async createStudent(admin: AdminContext, dto: CreateStudentDto) {
    await this.verifierUnicite(dto.email, dto.matricule);

    const classe = await this.prisma.schoolClass.findFirst({
      where: { id: dto.classId, establishmentId: admin.establishmentId },
    });
    if (!classe) throw new BadRequestException('Classe inconnue');

    const motDePasse = dto.password ?? motDePasseTemporaire();

    const etudiant = await this.prisma.student.create({
      data: {
        matricule: dto.matricule,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        externalUserId: randomUUID(),
        passwordHash: await bcrypt.hash(motDePasse, 12),
        classId: dto.classId,
        establishmentId: admin.establishmentId,
      },
    });

    await this.prisma.schoolClass.update({
      where: { id: dto.classId },
      data: { studentCount: { increment: 1 } },
    });

    await this.activity.log({
      establishmentId: admin.establishmentId,
      type: 'account_created',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: `Compte étudiant ${dto.firstName} ${dto.lastName} (${dto.matricule}) — classe ${classe.name}`,
    });

    return {
      success: true,
      message: 'Compte étudiant créé',
      id: etudiant.id,
      // Affiché une seule fois côté admin, à transmettre à l'étudiant.
      temporaryPassword: dto.password ? undefined : motDePasse,
    };
  }

  async updateStudent(admin: AdminContext, id: string, dto: UpdateStudentDto) {
    const existant = await this.prisma.student.findFirst({
      where: { id, establishmentId: admin.establishmentId },
    });
    if (!existant) throw new NotFoundException('Étudiant introuvable');

    if (dto.classId && dto.classId !== existant.classId) {
      const classe = await this.prisma.schoolClass.findFirst({
        where: { id: dto.classId, establishmentId: admin.establishmentId },
      });
      if (!classe) throw new BadRequestException('Classe inconnue');
      await this.prisma.$transaction([
        this.prisma.schoolClass.update({
          where: { id: existant.classId },
          data: { studentCount: { decrement: 1 } },
        }),
        this.prisma.schoolClass.update({
          where: { id: dto.classId },
          data: { studentCount: { increment: 1 } },
        }),
      ]);
    }

    await this.prisma.student.update({ where: { id }, data: { ...dto } });

    await this.activity.log({
      establishmentId: admin.establishmentId,
      type: 'account_updated',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: `Étudiant ${existant.firstName} ${existant.lastName} — champs : ${Object.keys(dto).join(', ')}`,
    });

    return { success: true, message: 'Étudiant mis à jour' };
  }

  async setStudentStatus(
    admin: AdminContext,
    id: string,
    suspendre: boolean,
    dto: SuspendAccountDto = {},
  ) {
    const etudiant = await this.prisma.student.findFirst({
      where: { id, establishmentId: admin.establishmentId },
    });
    if (!etudiant) throw new NotFoundException('Étudiant introuvable');

    await this.prisma.student.update({
      where: { id },
      data: { status: suspendre ? 'suspended' : 'active' },
    });

    await this.activity.log({
      establishmentId: admin.establishmentId,
      type: suspendre ? 'account_suspended' : 'account_reactivated',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: `Étudiant ${etudiant.firstName} ${etudiant.lastName} (${etudiant.matricule})${dto.reason ? ` — motif : ${dto.reason}` : ''}`,
    });

    return {
      success: true,
      message: suspendre
        ? 'Compte suspendu : plus aucun scan possible'
        : 'Compte réactivé',
    };
  }

  async resetStudentPassword(
    admin: AdminContext,
    id: string,
    dto: ResetPasswordDto,
  ) {
    const etudiant = await this.prisma.student.findFirst({
      where: { id, establishmentId: admin.establishmentId },
    });
    if (!etudiant) throw new NotFoundException('Étudiant introuvable');

    const motDePasse = dto.newPassword ?? motDePasseTemporaire();
    await this.prisma.student.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(motDePasse, 12) },
    });

    await this.activity.log({
      establishmentId: admin.establishmentId,
      type: 'password_reset',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: `Mot de passe réinitialisé — étudiant ${etudiant.firstName} ${etudiant.lastName}`,
    });

    return {
      success: true,
      message: 'Mot de passe réinitialisé',
      temporaryPassword: dto.newPassword ? undefined : motDePasse,
    };
  }

  /* =============================== Enseignants ============================== */

  async listTeachers(
    establishmentId: string,
    filters: { status?: string; search?: string } = {},
  ) {
    const where: any = { establishmentId };
    if (filters.status) where.status = filters.status;
    if (filters.search) {
      where.OR = [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const enseignants = await this.prisma.teacher.findMany({
      where,
      orderBy: [{ lastName: 'asc' }],
      include: {
        faculty: true,
        subjectLinks: { select: { subjectId: true } },
        assignments: { select: { classId: true } },
      },
    });

    return enseignants.map((t) => this.mapTeacher(t));
  }

  async getTeacher(establishmentId: string, id: string) {
    const t = await this.prisma.teacher.findFirst({
      where: { id, establishmentId },
      include: {
        faculty: true,
        subjectLinks: { select: { subjectId: true } },
        assignments: { select: { classId: true } },
      },
    });
    if (!t) throw new NotFoundException('Enseignant introuvable');
    return this.mapTeacher(t);
  }

  async createTeacher(admin: AdminContext, dto: CreateTeacherDto) {
    const existant = await this.prisma.teacher.findUnique({
      where: { email: dto.email },
    });
    if (existant) throw new ConflictException('Cet email est déjà utilisé');

    const motDePasse = dto.password ?? motDePasseTemporaire();

    const enseignant = await this.prisma.teacher.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        department: dto.department,
        facultyId: dto.facultyId,
        hireDate: new Date(),
        externalUserId: randomUUID(),
        passwordHash: await bcrypt.hash(motDePasse, 12),
        establishmentId: admin.establishmentId,
      },
    });

    await this.activity.log({
      establishmentId: admin.establishmentId,
      type: 'account_created',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: `Compte enseignant ${dto.firstName} ${dto.lastName}`,
    });

    return {
      success: true,
      message: 'Compte enseignant créé',
      id: enseignant.id,
      temporaryPassword: dto.password ? undefined : motDePasse,
    };
  }

  async updateTeacher(admin: AdminContext, id: string, dto: UpdateTeacherDto) {
    const existant = await this.prisma.teacher.findFirst({
      where: { id, establishmentId: admin.establishmentId },
    });
    if (!existant) throw new NotFoundException('Enseignant introuvable');

    await this.prisma.teacher.update({ where: { id }, data: { ...dto } });

    await this.activity.log({
      establishmentId: admin.establishmentId,
      type: 'account_updated',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: `Enseignant ${existant.firstName} ${existant.lastName} — champs : ${Object.keys(dto).join(', ')}`,
    });

    return { success: true, message: 'Enseignant mis à jour' };
  }

  async setTeacherStatus(
    admin: AdminContext,
    id: string,
    suspendre: boolean,
    dto: SuspendAccountDto = {},
  ) {
    const enseignant = await this.prisma.teacher.findFirst({
      where: { id, establishmentId: admin.establishmentId },
    });
    if (!enseignant) throw new NotFoundException('Enseignant introuvable');

    await this.prisma.teacher.update({
      where: { id },
      data: { status: suspendre ? 'suspended' : 'active' },
    });

    await this.activity.log({
      establishmentId: admin.establishmentId,
      type: suspendre ? 'account_suspended' : 'account_reactivated',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: `Enseignant ${enseignant.firstName} ${enseignant.lastName}${dto.reason ? ` — motif : ${dto.reason}` : ''}`,
    });

    return {
      success: true,
      message: suspendre ? 'Compte enseignant suspendu' : 'Compte réactivé',
    };
  }

  async resetTeacherPassword(
    admin: AdminContext,
    id: string,
    dto: ResetPasswordDto,
  ) {
    const enseignant = await this.prisma.teacher.findFirst({
      where: { id, establishmentId: admin.establishmentId },
    });
    if (!enseignant) throw new NotFoundException('Enseignant introuvable');

    const motDePasse = dto.newPassword ?? motDePasseTemporaire();
    await this.prisma.teacher.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(motDePasse, 12) },
    });

    await this.activity.log({
      establishmentId: admin.establishmentId,
      type: 'password_reset',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: `Mot de passe réinitialisé — enseignant ${enseignant.firstName} ${enseignant.lastName}`,
    });

    return {
      success: true,
      message: 'Mot de passe réinitialisé',
      temporaryPassword: dto.newPassword ? undefined : motDePasse,
    };
  }

  /* ============================ Chefs de classe ============================= */

  /** Liste consommée par /admin/chefs. */
  async listLeaders(establishmentId: string) {
    const classes = await this.prisma.schoolClass.findMany({
      where: { establishmentId },
      include: {
        leader: true,
        deputyLeader: true,
        programRef: { include: { faculty: true } },
      },
      orderBy: { name: 'asc' },
    });

    return classes.map((c) => ({
      classId: c.id,
      className: c.name,
      level: c.level,
      filiereName: c.programRef?.name ?? c.program,
      facultyName: c.programRef?.faculty?.name ?? '',
      studentCount: c.studentCount,
      chief: c.leader
        ? {
            id: c.leader.id,
            name: `${c.leader.firstName} ${c.leader.lastName}`,
            matricule: c.leader.matricule,
            email: c.leader.email,
            status: mapUserStatus(c.leader.status),
          }
        : null,
      substitute: c.deputyLeader
        ? {
            id: c.deputyLeader.id,
            name: `${c.deputyLeader.firstName} ${c.deputyLeader.lastName}`,
            matricule: c.deputyLeader.matricule,
            email: c.deputyLeader.email,
            status: mapUserStatus(c.deputyLeader.status),
          }
        : null,
    }));
  }

  /**
   * Désigne un chef de classe (ou son suppléant).
   * Le chef est un attribut de la classe, jamais un compte séparé : il garde
   * son compte étudiant et gagne seulement le droit d'afficher le QR Code.
   */
  async assignLeader(admin: AdminContext, classId: string, dto: AssignLeaderDto) {
    const classe = await this.prisma.schoolClass.findFirst({
      where: { id: classId, establishmentId: admin.establishmentId },
    });
    if (!classe) throw new NotFoundException('Classe introuvable');

    const etudiant = await this.prisma.student.findFirst({
      where: { id: dto.studentId, establishmentId: admin.establishmentId },
    });
    if (!etudiant) throw new NotFoundException('Étudiant introuvable');

    if (etudiant.classId !== classId) {
      throw new BadRequestException(
        "L'étudiant désigné doit appartenir à cette classe",
      );
    }
    if (etudiant.status !== 'active') {
      throw new BadRequestException(
        'Un compte suspendu ne peut pas être chef de classe',
      );
    }

    const estSuppleant = dto.isDeputy === true;

    // Un étudiant ne peut pas cumuler les deux rôles.
    if (estSuppleant && classe.leaderId === dto.studentId) {
      throw new BadRequestException(
        'Cet étudiant est déjà chef de classe titulaire',
      );
    }
    if (!estSuppleant && classe.deputyLeaderId === dto.studentId) {
      await this.prisma.schoolClass.update({
        where: { id: classId },
        data: { deputyLeaderId: null },
      });
    }

    await this.prisma.schoolClass.update({
      where: { id: classId },
      data: estSuppleant
        ? { deputyLeaderId: dto.studentId }
        : { leaderId: dto.studentId },
    });

    await this.activity.log({
      establishmentId: admin.establishmentId,
      type: 'leader_assigned',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: `${estSuppleant ? 'Suppléant' : 'Chef de classe'} de ${classe.name} : ${etudiant.firstName} ${etudiant.lastName} (${etudiant.matricule})`,
    });

    return {
      success: true,
      message: estSuppleant ? 'Suppléant désigné' : 'Chef de classe désigné',
    };
  }

  async removeLeader(admin: AdminContext, classId: string, estSuppleant: boolean) {
    const classe = await this.prisma.schoolClass.findFirst({
      where: { id: classId, establishmentId: admin.establishmentId },
    });
    if (!classe) throw new NotFoundException('Classe introuvable');

    await this.prisma.schoolClass.update({
      where: { id: classId },
      data: estSuppleant ? { deputyLeaderId: null } : { leaderId: null },
    });

    await this.activity.log({
      establishmentId: admin.establishmentId,
      type: 'leader_assigned',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: `Retrait du ${estSuppleant ? 'suppléant' : 'chef de classe'} — ${classe.name}`,
    });

    return { success: true, message: 'Désignation retirée' };
  }

  /* ================================ Privé ================================== */

  private async verifierUnicite(email: string, matricule: string) {
    const conflit = await this.prisma.student.findFirst({
      where: { OR: [{ email }, { matricule }] },
      select: { email: true, matricule: true },
    });
    if (conflit) {
      throw new ConflictException(
        conflit.email === email
          ? 'Cet email est déjà utilisé'
          : 'Ce matricule existe déjà',
      );
    }
  }

  private mapStudent(e: any) {
    const total = e.attendanceRecords?.length ?? 0;
    const presents =
      e.attendanceRecords?.filter(
        (r: any) => r.status === 'present' || r.status === 'late',
      ).length ?? 0;

    return {
      id: e.id,
      matricule: e.matricule,
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email,
      phone: '',
      classId: e.classId,
      className: e.class?.name ?? '',
      facultyId: e.class?.programRef?.faculty?.id ?? '',
      facultyName: e.class?.programRef?.faculty?.name ?? '',
      filiereId: e.class?.programRef?.id ?? '',
      filiereName: e.class?.programRef?.name ?? e.class?.program ?? '',
      level: e.class?.level ?? '',
      status: mapUserStatus(e.status),
      enrollmentDate: isoDate(e.createdAt),
      attendanceRate: pourcentage(presents, total),
      isClassLeader: !!e.leaderClass,
      isDeputyLeader: !!e.deputyLeaderClass,
    };
  }

  private mapTeacher(t: any) {
    return {
      id: t.id,
      matricule: t.externalUserId?.slice(0, 8) ?? '',
      firstName: t.firstName,
      lastName: t.lastName,
      email: t.email,
      phone: '',
      department: t.department ?? '',
      facultyId: t.facultyId ?? '',
      facultyName: t.faculty?.name ?? '',
      status: mapUserStatus(t.status),
      hireDate: isoDate(t.hireDate ?? t.createdAt),
      subjectsCount: t.subjectLinks?.length ?? 0,
      classesCount: new Set((t.assignments ?? []).map((a: any) => a.classId))
        .size,
    };
  }
}
