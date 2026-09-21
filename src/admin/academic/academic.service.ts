/**
 * Référentiel académique : facultés, filières, matières, classes,
 * affectations et emploi du temps.
 *
 * L'emploi du temps est le point sensible : un créneau mal posé (même
 * enseignant à deux endroits, même salle occupée deux fois) produit des
 * séances impossibles, donc des présences ininterprétables. La détection de
 * conflit est faite à l'écriture ET recalculée à la lecture.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../common/activity.service';
import { AdminContext } from '../auth/current-admin.decorator';
import { minutesDepuisMinuit, nomDuJour } from '../common/mappers';
import {
  CreateAssignmentDto,
  CreateClassDto,
  CreateFacultyDto,
  CreateProgramDto,
  CreateRoomDto,
  CreateScheduleDto,
  CreateSubjectDto,
  UpdateRoomDto,
  UpdateScheduleDto,
} from '../dto/admin.dto';

@Injectable()
export class AcademicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /* ------------------------------- Facultés ------------------------------- */

  async listFaculties(establishmentId: string) {
    const facultes = await this.prisma.faculty.findMany({
      where: { establishmentId },
      orderBy: { name: 'asc' },
      include: {
        programs: { include: { classes: { select: { studentCount: true } } } },
        subjects: { select: { id: true } },
        teachers: { select: { id: true } },
      },
    });

    return facultes.map((f) => ({
      id: f.id,
      name: f.name,
      code: f.code,
      deanName: f.deanName ?? '',
      departmentCount: f.programs.length,
      filiereCount: f.programs.length,
      studentCount: f.programs.reduce(
        (acc, p) => acc + p.classes.reduce((a, c) => a + c.studentCount, 0),
        0,
      ),
      teacherCount: f.teachers.length,
    }));
  }

  async createFaculty(admin: AdminContext, dto: CreateFacultyDto) {
    const existant = await this.prisma.faculty.findFirst({
      where: { establishmentId: admin.establishmentId, code: dto.code },
    });
    if (existant) throw new ConflictException('Ce code de faculté existe déjà');

    const f = await this.prisma.faculty.create({
      data: { ...dto, establishmentId: admin.establishmentId },
    });
    await this.trace(admin, `Faculté créée : ${dto.name} (${dto.code})`);
    return { success: true, id: f.id, message: 'Faculté créée' };
  }

  /* -------------------------------- Filières ------------------------------ */

  async listPrograms(establishmentId: string) {
    const filieres = await this.prisma.program.findMany({
      where: { establishmentId },
      orderBy: { name: 'asc' },
      include: { faculty: true, classes: { select: { studentCount: true } } },
    });

    return filieres.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      facultyId: p.facultyId,
      facultyName: p.faculty.name,
      level: p.level,
      studentCount: p.classes.reduce((a, c) => a + c.studentCount, 0),
      classCount: p.classes.length,
    }));
  }

  async createProgram(admin: AdminContext, dto: CreateProgramDto) {
    const faculte = await this.prisma.faculty.findFirst({
      where: { id: dto.facultyId, establishmentId: admin.establishmentId },
    });
    if (!faculte) throw new BadRequestException('Faculté inconnue');

    const p = await this.prisma.program.create({
      data: { ...dto, establishmentId: admin.establishmentId },
    });
    await this.trace(admin, `Filière créée : ${dto.name} (${faculte.name})`);
    return { success: true, id: p.id, message: 'Filière créée' };
  }

  /* -------------------------------- Matières ------------------------------ */

  async listSubjects(establishmentId: string) {
    const matieres = await this.prisma.subject.findMany({
      where: { establishmentId },
      orderBy: { name: 'asc' },
      include: {
        faculty: true,
        teacherLinks: { select: { teacherId: true } },
        assignments: { select: { classId: true } },
      },
    });

    return matieres.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      description: s.description ?? '',
      hoursVolume: s.volumeHours,
      credits: s.credits,
      facultyId: s.facultyId ?? '',
      facultyName: s.faculty?.name ?? '',
      teacherCount: s.teacherLinks.length,
      classCount: new Set(s.assignments.map((a) => a.classId)).size,
    }));
  }

  async createSubject(admin: AdminContext, dto: CreateSubjectDto) {
    const existant = await this.prisma.subject.findUnique({
      where: { code: dto.code },
    });
    if (existant) throw new ConflictException('Ce code matière existe déjà');

    const s = await this.prisma.subject.create({
      data: {
        name: dto.name,
        code: dto.code,
        volumeHours: dto.volumeHours,
        credits: dto.credits ?? 0,
        description: dto.description,
        facultyId: dto.facultyId,
        establishmentId: admin.establishmentId,
      },
    });
    await this.trace(admin, `Matière créée : ${dto.name} (${dto.code})`);
    return { success: true, id: s.id, message: 'Matière créée' };
  }

  /* -------------------------------- Classes ------------------------------- */

  async listClasses(establishmentId: string) {
    const classes = await this.prisma.schoolClass.findMany({
      where: { establishmentId },
      orderBy: { name: 'asc' },
      include: {
        leader: true,
        deputyLeader: true,
        programRef: { include: { faculty: true } },
        scheduleEntries: { select: { id: true } },
      },
    });

    return classes.map((c) => ({
      id: c.id,
      name: c.name,
      level: c.level,
      filiereId: c.programId ?? '',
      filiereName: c.programRef?.name ?? c.program,
      facultyId: c.programRef?.facultyId ?? '',
      facultyName: c.programRef?.faculty?.name ?? '',
      studentCount: c.studentCount,
      chiefId: c.leaderId ?? '',
      chiefName: c.leader ? `${c.leader.firstName} ${c.leader.lastName}` : '',
      substituteId: c.deputyLeaderId,
      substituteName: c.deputyLeader
        ? `${c.deputyLeader.firstName} ${c.deputyLeader.lastName}`
        : null,
      scheduleCount: c.scheduleEntries.length,
    }));
  }

  async getClass(establishmentId: string, id: string) {
    const liste = await this.listClasses(establishmentId);
    const c = liste.find((x) => x.id === id);
    if (!c) throw new NotFoundException('Classe introuvable');
    return c;
  }

  async createClass(admin: AdminContext, dto: CreateClassDto) {
    const c = await this.prisma.schoolClass.create({
      data: {
        name: dto.name,
        level: dto.level,
        program: dto.program,
        programId: dto.programId,
        establishmentId: admin.establishmentId,
      },
    });
    await this.trace(admin, `Classe créée : ${dto.name}`);
    return { success: true, id: c.id, message: 'Classe créée' };
  }

  /* ------------------------------ Affectations ---------------------------- */

  async listAssignments(establishmentId: string) {
    const affectations = await this.prisma.assignment.findMany({
      where: { class: { establishmentId } },
      include: { teacher: true, subject: true, class: true },
      orderBy: { subject: { name: 'asc' } },
    });

    return affectations.map((a) => ({
      id: a.id,
      teacherId: a.teacherId,
      teacherName: `${a.teacher.firstName} ${a.teacher.lastName}`,
      subjectId: a.subjectId,
      subjectName: a.subject.name,
      subjectCode: a.subject.code,
      classId: a.classId,
      className: a.class.name,
      hoursVolume: a.subject.volumeHours,
      semester: '',
    }));
  }

  async createAssignment(admin: AdminContext, dto: CreateAssignmentDto) {
    const [enseignant, matiere, classe] = await Promise.all([
      this.prisma.teacher.findFirst({
        where: { id: dto.teacherId, establishmentId: admin.establishmentId },
      }),
      this.prisma.subject.findFirst({
        where: { id: dto.subjectId, establishmentId: admin.establishmentId },
      }),
      this.prisma.schoolClass.findFirst({
        where: { id: dto.classId, establishmentId: admin.establishmentId },
      }),
    ]);
    if (!enseignant) throw new BadRequestException('Enseignant inconnu');
    if (!matiere) throw new BadRequestException('Matière inconnue');
    if (!classe) throw new BadRequestException('Classe inconnue');
    if (enseignant.status !== 'active') {
      throw new BadRequestException(
        "Impossible d'affecter un enseignant suspendu",
      );
    }

    const existant = await this.prisma.assignment.findUnique({
      where: {
        teacherId_subjectId_classId: {
          teacherId: dto.teacherId,
          subjectId: dto.subjectId,
          classId: dto.classId,
        },
      },
    });
    if (existant) throw new ConflictException('Cette affectation existe déjà');

    const a = await this.prisma.assignment.create({ data: { ...dto } });

    // Le lien enseignant↔matière sert aux filtres côté enseignant.
    await this.prisma.teacherSubject.upsert({
      where: {
        teacherId_subjectId: {
          teacherId: dto.teacherId,
          subjectId: dto.subjectId,
        },
      },
      create: { teacherId: dto.teacherId, subjectId: dto.subjectId },
      update: {},
    });

    await this.trace(
      admin,
      `Affectation : ${enseignant.lastName} → ${matiere.name} / ${classe.name}`,
    );
    return { success: true, id: a.id, message: 'Affectation créée' };
  }

  async deleteAssignment(admin: AdminContext, id: string) {
    const a = await this.prisma.assignment.findFirst({
      where: { id, class: { establishmentId: admin.establishmentId } },
      include: { teacher: true, subject: true, class: true },
    });
    if (!a) throw new NotFoundException('Affectation introuvable');

    await this.prisma.assignment.delete({ where: { id } });
    await this.trace(
      admin,
      `Affectation supprimée : ${a.teacher.lastName} → ${a.subject.name} / ${a.class.name}`,
    );
    return { success: true, message: 'Affectation supprimée' };
  }

  /* --------------------------------- Salles -------------------------------- */

  async listRooms(establishmentId: string) {
    const salles = await this.prisma.room.findMany({
      where: { establishmentId },
      include: { _count: { select: { scheduleEntries: true } } },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return salles.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      capacity: s.capacity,
      creneauxCount: s._count.scheduleEntries,
    }));
  }

  async createRoom(admin: AdminContext, dto: CreateRoomDto) {
    const existante = await this.prisma.room.findFirst({
      where: { establishmentId: admin.establishmentId, name: dto.name },
    });
    if (existante) {
      throw new BadRequestException('Une salle porte déjà ce nom');
    }

    const salle = await this.prisma.room.create({
      data: { ...dto, establishmentId: admin.establishmentId },
    });

    await this.trace(admin, `Salle créée : ${dto.name} (${dto.type}, ${dto.capacity} places)`);
    return { success: true, id: salle.id, message: 'Salle créée' };
  }

  async updateRoom(admin: AdminContext, id: string, dto: UpdateRoomDto) {
    const salle = await this.prisma.room.findFirst({
      where: { id, establishmentId: admin.establishmentId },
    });
    if (!salle) throw new NotFoundException('Salle introuvable');

    await this.prisma.room.update({ where: { id }, data: { ...dto } });
    await this.trace(admin, `Salle modifiée : ${salle.name}`);
    return { success: true, message: 'Salle mise à jour' };
  }

  async deleteRoom(admin: AdminContext, id: string) {
    const salle = await this.prisma.room.findFirst({
      where: { id, establishmentId: admin.establishmentId },
      include: { _count: { select: { scheduleEntries: true } } },
    });
    if (!salle) throw new NotFoundException('Salle introuvable');
    if (salle._count.scheduleEntries > 0) {
      throw new BadRequestException(
        `Impossible : ${salle._count.scheduleEntries} créneau(x) utilisent encore cette salle`,
      );
    }

    await this.prisma.room.delete({ where: { id } });
    await this.trace(admin, `Salle supprimée : ${salle.name}`);
    return { success: true, message: 'Salle supprimée' };
  }

  /* --------------------------- Emploi du temps ---------------------------- */

  async listSchedules(establishmentId: string, classId?: string) {
    const where: any = { class: { establishmentId } };
    if (classId) where.classId = classId;

    const creneaux = await this.prisma.scheduleEntry.findMany({
      where,
      include: { subject: true, teacher: true, class: true, room: true },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    const conflits = this.calculerConflits(creneaux);

    return creneaux.map((s) => ({
      id: s.id,
      day: nomDuJour(s.dayOfWeek),
      dayOfWeek: s.dayOfWeek,
      date: '',
      startTime: s.startTime,
      endTime: s.endTime,
      subjectId: s.subjectId,
      subjectName: s.subject.name,
      subjectCode: s.subject.code,
      teacherId: s.teacherId,
      teacherName: `${s.teacher.firstName} ${s.teacher.lastName}`,
      classId: s.classId,
      className: s.class.name,
      sessionType: s.sessionType,
      room: { id: s.room.id, name: s.room.name, type: s.room.type, capacity: s.room.capacity },
      hasConflict: conflits.has(s.id),
      conflictReason: conflits.get(s.id) ?? null,
    }));
  }

  async createSchedule(admin: AdminContext, dto: CreateScheduleDto) {
    const debut = minutesDepuisMinuit(dto.startTime);
    const fin = minutesDepuisMinuit(dto.endTime);
    if (debut === null || fin === null) {
      throw new BadRequestException('Horaires attendus au format HH:MM');
    }
    if (fin <= debut) {
      throw new BadRequestException(
        "L'heure de fin doit être après l'heure de début",
      );
    }

    const salle = await this.prisma.room.findFirst({
      where: { id: dto.roomId, establishmentId: admin.establishmentId },
    });
    if (!salle) throw new NotFoundException('Salle introuvable');
    if (salle.type !== dto.sessionType) {
      throw new BadRequestException(
        salle.type === 'CM'
          ? `${salle.name} est un amphi (CM) : ne convient pas pour un cours de TD`
          : `${salle.name} est une salle de TD : ne convient pas pour un cours magistral (CM)`,
      );
    }

    // Conflit bloquant : enseignant ou salle déjà pris sur ce créneau.
    const memeJour = await this.prisma.scheduleEntry.findMany({
      where: {
        dayOfWeek: dto.dayOfWeek,
        class: { establishmentId: admin.establishmentId },
        OR: [{ teacherId: dto.teacherId }, { roomId: dto.roomId }],
      },
      include: { teacher: true, class: true },
    });

    for (const c of memeJour) {
      const d = minutesDepuisMinuit(c.startTime);
      const f = minutesDepuisMinuit(c.endTime);
      if (d === null || f === null) continue;
      if (!(debut < f && d < fin)) continue;

      if (c.teacherId === dto.teacherId) {
        throw new ConflictException(
          `${c.teacher.firstName} ${c.teacher.lastName} a déjà cours avec ${c.class.name} de ${c.startTime} à ${c.endTime}`,
        );
      }
      throw new ConflictException(
        `${salle.name} est déjà occupée par ${c.class.name} de ${c.startTime} à ${c.endTime}`,
      );
    }

    const s = await this.prisma.scheduleEntry.create({ data: { ...dto } });

    await this.activity.log({
      establishmentId: admin.establishmentId,
      type: 'schedule_modified',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: `Créneau ajouté : ${nomDuJour(dto.dayOfWeek)} ${dto.startTime}-${dto.endTime}, ${salle.name} (${dto.sessionType})`,
    });

    return { success: true, id: s.id, message: 'Créneau ajouté' };
  }

  async updateSchedule(admin: AdminContext, id: string, dto: UpdateScheduleDto) {
    const existant = await this.prisma.scheduleEntry.findFirst({
      where: { id, class: { establishmentId: admin.establishmentId } },
    });
    if (!existant) throw new NotFoundException('Créneau introuvable');

    // Fusionne les champs fournis avec ceux déjà en place, puis rejoue
    // exactement les mêmes contrôles que la création (type de salle,
    // conflit enseignant/salle) sur le résultat final.
    const fusion = {
      classId: dto.classId ?? existant.classId,
      subjectId: dto.subjectId ?? existant.subjectId,
      teacherId: dto.teacherId ?? existant.teacherId,
      roomId: dto.roomId ?? existant.roomId,
      sessionType: dto.sessionType ?? existant.sessionType,
      dayOfWeek: dto.dayOfWeek ?? existant.dayOfWeek,
      startTime: dto.startTime ?? existant.startTime,
      endTime: dto.endTime ?? existant.endTime,
    };

    const debut = minutesDepuisMinuit(fusion.startTime);
    const fin = minutesDepuisMinuit(fusion.endTime);
    if (debut === null || fin === null) {
      throw new BadRequestException('Horaires attendus au format HH:MM');
    }
    if (fin <= debut) {
      throw new BadRequestException(
        "L'heure de fin doit être après l'heure de début",
      );
    }

    const salle = await this.prisma.room.findFirst({
      where: { id: fusion.roomId, establishmentId: admin.establishmentId },
    });
    if (!salle) throw new NotFoundException('Salle introuvable');
    if (salle.type !== fusion.sessionType) {
      throw new BadRequestException(
        salle.type === 'CM'
          ? `${salle.name} est un amphi (CM) : ne convient pas pour un cours de TD`
          : `${salle.name} est une salle de TD : ne convient pas pour un cours magistral (CM)`,
      );
    }

    const memeJour = await this.prisma.scheduleEntry.findMany({
      where: {
        id: { not: id },
        dayOfWeek: fusion.dayOfWeek,
        class: { establishmentId: admin.establishmentId },
        OR: [{ teacherId: fusion.teacherId }, { roomId: fusion.roomId }],
      },
      include: { teacher: true, class: true },
    });

    for (const c of memeJour) {
      const d = minutesDepuisMinuit(c.startTime);
      const f = minutesDepuisMinuit(c.endTime);
      if (d === null || f === null) continue;
      if (!(debut < f && d < fin)) continue;

      if (c.teacherId === fusion.teacherId) {
        throw new ConflictException(
          `${c.teacher.firstName} ${c.teacher.lastName} a déjà cours avec ${c.class.name} de ${c.startTime} à ${c.endTime}`,
        );
      }
      throw new ConflictException(
        `${salle.name} est déjà occupée par ${c.class.name} de ${c.startTime} à ${c.endTime}`,
      );
    }

    await this.prisma.scheduleEntry.update({ where: { id }, data: fusion });

    await this.activity.log({
      establishmentId: admin.establishmentId,
      type: 'schedule_modified',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: `Créneau modifié : ${nomDuJour(fusion.dayOfWeek)} ${fusion.startTime}-${fusion.endTime}, ${salle.name}`,
    });

    return { success: true, message: 'Créneau mis à jour' };
  }

  async deleteSchedule(admin: AdminContext, id: string) {
    const s = await this.prisma.scheduleEntry.findFirst({
      where: { id, class: { establishmentId: admin.establishmentId } },
      include: { class: true },
    });
    if (!s) throw new NotFoundException('Créneau introuvable');

    await this.prisma.scheduleEntry.delete({ where: { id } });
    await this.activity.log({
      establishmentId: admin.establishmentId,
      type: 'schedule_modified',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: `Créneau supprimé : ${s.class.name} ${nomDuJour(s.dayOfWeek)} ${s.startTime}`,
    });
    return { success: true, message: 'Créneau supprimé' };
  }

  /** Recalcul des chevauchements enseignant / salle sur l'ensemble des créneaux. */
  private calculerConflits(creneaux: any[]): Map<string, string> {
    const conflits = new Map<string, string>();

    for (let i = 0; i < creneaux.length; i += 1) {
      for (let j = i + 1; j < creneaux.length; j += 1) {
        const a = creneaux[i];
        const b = creneaux[j];
        if (a.dayOfWeek !== b.dayOfWeek) continue;

        const da = minutesDepuisMinuit(a.startTime);
        const fa = minutesDepuisMinuit(a.endTime);
        const db = minutesDepuisMinuit(b.startTime);
        const fb = minutesDepuisMinuit(b.endTime);
        if ([da, fa, db, fb].some((v) => v === null)) continue;
        if (!(da! < fb! && db! < fa!)) continue;

        if (a.teacherId === b.teacherId) {
          const motif = `Enseignant en double : ${a.teacher.firstName} ${a.teacher.lastName}`;
          conflits.set(a.id, motif);
          conflits.set(b.id, motif);
        } else if (a.roomId === b.roomId) {
          const motif = `Salle ${a.room?.name ?? ''} occupée deux fois`;
          conflits.set(a.id, motif);
          conflits.set(b.id, motif);
        }
      }
    }
    return conflits;
  }

  private trace(admin: AdminContext, label: string) {
    return this.activity.log({
      establishmentId: admin.establishmentId,
      type: 'account_updated',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: label,
    });
  }
}
