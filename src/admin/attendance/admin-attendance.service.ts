/**
 * Présences vues par l'administration.
 *
 * La correction d'une présence est l'opération la plus sensible du système :
 * elle réécrit une donnée qui sert à valider une année. Deux garde-fous ici :
 *  - la correction n'écrase rien en silence, elle stocke l'auteur, la date et
 *    une note obligatoire ;
 *  - elle est systématiquement journalisée avec l'ancienne et la nouvelle
 *    valeur, donc relisible dans /admin/journal.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../common/activity.service';
import { AttendanceGateway } from '../../realtime/attendance.gateway';
import { AdminSettingsService } from '../settings/admin-settings.service';
import { AdminContext } from '../auth/current-admin.decorator';
import { isoDate, mapAttendanceStatus } from '../common/mappers';
import { ManualAttendanceDto, UpdateAttendanceDto } from '../dto/admin.dto';

@Injectable()
export class AdminAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly gateway: AttendanceGateway,
    private readonly settings: AdminSettingsService,
  ) {}

  async list(
    establishmentId: string,
    filters: {
      classId?: string;
      studentId?: string;
      subjectId?: string;
      status?: string;
      from?: string;
      to?: string;
      limit?: number;
    } = {},
  ) {
    const where: any = { session: { establishmentId } };
    if (filters.classId) where.session.classId = filters.classId;
    if (filters.subjectId) where.session.subjectId = filters.subjectId;
    if (filters.studentId) where.studentId = filters.studentId;
    if (filters.status) {
      const map: Record<string, string> = {
        present: 'present',
        late: 'late',
        absent: 'absent',
        excused: 'rejected',
      };
      where.status = map[filters.status] ?? filters.status;
    }
    if (filters.from || filters.to) {
      where.session.date = {};
      if (filters.from) where.session.date.gte = new Date(filters.from);
      if (filters.to) where.session.date.lte = new Date(filters.to);
    }

    const records = await this.prisma.attendanceRecord.findMany({
      where,
      orderBy: [{ session: { date: 'desc' } }, { scannedAt: 'desc' }],
      take: Math.min(Number(filters.limit) || 300, 1000),
      include: {
        student: { include: { class: true } },
        session: { include: { subject: true, teacher: true, class: true } },
      },
    });

    return records.map((r) => this.map(r));
  }

  async getById(establishmentId: string, id: string) {
    const r = await this.prisma.attendanceRecord.findFirst({
      where: { id, session: { establishmentId } },
      include: {
        student: { include: { class: true } },
        session: { include: { subject: true, teacher: true, class: true } },
        correctedBy: { select: { firstName: true, lastName: true } },
        fraudAlerts: {
          select: { id: true, type: true, severity: true, status: true, title: true },
        },
      },
    });
    if (!r) throw new NotFoundException('Présence introuvable');

    return {
      ...this.map(r),
      // Empreinte technique : utile pour l'enquête, jamais affichée à l'étudiant.
      deviceFingerprint: r.deviceFingerprint,
      ipAddress: r.ipAddress,
      location:
        r.latitude !== null && r.longitude !== null
          ? { latitude: r.latitude, longitude: r.longitude, accuracyMeters: r.accuracyMeters }
          : null,
      correction: r.correctedById
        ? {
            by: r.correctedBy
              ? `${r.correctedBy.firstName} ${r.correctedBy.lastName}`
              : 'Administration',
            at: r.correctedAt?.toISOString() ?? null,
            note: r.correctionNote,
          }
        : null,
      fraudAlerts: r.fraudAlerts,
    };
  }

  /** PATCH /api/admin/attendances/:id */
  async update(admin: AdminContext, id: string, dto: UpdateAttendanceDto) {
    const r = await this.prisma.attendanceRecord.findFirst({
      where: { id, session: { establishmentId: admin.establishmentId } },
      include: {
        student: true,
        session: { include: { subject: true } },
      },
    });
    if (!r) throw new NotFoundException('Présence introuvable');

    const ancien = r.status;
    if (ancien === dto.status) {
      return { success: true, message: 'Aucun changement' };
    }

    await this.prisma.attendanceRecord.update({
      where: { id },
      data: {
        status: dto.status as any,
        correctedById: admin.id,
        correctedAt: new Date(),
        correctionNote: dto.note ?? 'Correction administrative',
      },
    });

    const presents = await this.prisma.attendanceRecord.count({
      where: { sessionId: r.sessionId, status: { in: ['present', 'late'] } },
    });
    this.gateway.emitPresenceUpdate(r.sessionId, presents);

    await this.activity.log({
      establishmentId: admin.establishmentId,
      type: 'attendance_corrected',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: `${r.student.firstName} ${r.student.lastName} — ${r.session.subject.name} : ${ancien} → ${dto.status}${dto.note ? ` (${dto.note})` : ''}`,
    });

    return {
      success: true,
      message: `Présence mise à jour : ${mapAttendanceStatus(dto.status)}`,
    };
  }

  /** Ajout manuel, uniquement si les paramètres l'autorisent. */
  async createManual(admin: AdminContext, dto: ManualAttendanceDto) {
    const params = await this.settings.getRaw(admin.establishmentId);
    if (!params.allowManualAttendance) {
      throw new BadRequestException(
        'Le pointage manuel est désactivé dans les paramètres',
      );
    }

    const [session, etudiant] = await Promise.all([
      this.prisma.classSession.findFirst({
        where: { id: dto.sessionId, establishmentId: admin.establishmentId },
        include: { subject: true },
      }),
      this.prisma.student.findFirst({
        where: { id: dto.studentId, establishmentId: admin.establishmentId },
      }),
    ]);
    if (!session) throw new NotFoundException('Séance introuvable');
    if (!etudiant) throw new NotFoundException('Étudiant introuvable');
    if (etudiant.classId !== session.classId) {
      throw new BadRequestException(
        "Cet étudiant n'appartient pas à la classe de la séance",
      );
    }

    const existant = await this.prisma.attendanceRecord.findUnique({
      where: {
        sessionId_studentId: {
          sessionId: dto.sessionId,
          studentId: dto.studentId,
        },
      },
    });
    if (existant) {
      throw new BadRequestException(
        'Une présence existe déjà pour cet étudiant sur cette séance — utilisez la correction',
      );
    }

    const record = await this.prisma.attendanceRecord.create({
      data: {
        sessionId: dto.sessionId,
        studentId: dto.studentId,
        status: dto.status as any,
        method: 'manual',
        scannedAt: new Date(),
        correctedById: admin.id,
        correctedAt: new Date(),
        correctionNote: dto.note,
      },
    });

    await this.activity.log({
      establishmentId: admin.establishmentId,
      type: 'attendance_corrected',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: `Ajout manuel : ${etudiant.firstName} ${etudiant.lastName} — ${session.subject.name} (${dto.status}) — ${dto.note}`,
    });

    return { success: true, id: record.id, message: 'Présence ajoutée' };
  }

  private map(r: any) {
    return {
      id: r.id,
      studentId: r.studentId,
      studentName: `${r.student.firstName} ${r.student.lastName}`,
      studentMatricule: r.student.matricule,
      classId: r.session.classId,
      className: r.session.class.name,
      subjectId: r.session.subjectId,
      subjectName: r.session.subject.name,
      teacherId: r.session.teacherId,
      teacherName: `${r.session.teacher.firstName} ${r.session.teacher.lastName}`,
      date: isoDate(r.session.date),
      time: r.scannedAt?.toISOString().slice(11, 16) ?? r.session.startTime,
      status: mapAttendanceStatus(r.status),
      method: r.method === 'qr' ? 'qr' : 'manual',
      corrected: !!r.correctedById,
    };
  }
}
