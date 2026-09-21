/**
 * Supervision des séances et des QR Codes.
 *
 * L'admin ne génère pas de QR (c'est le rôle de l'enseignant / du chef de
 * classe) : il surveille, relance une séance bloquée et force la clôture.
 * Chaque intervention est tracée — une relance permet de rouvrir un pointage,
 * c'est un levier de fraude s'il n'est pas journalisé.
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
import {
  isoDate,
  mapAttendanceStatus,
  mapSessionStatus,
  pourcentage,
} from '../common/mappers';

@Injectable()
export class AdminSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly gateway: AttendanceGateway,
    private readonly settings: AdminSettingsService,
  ) {}

  async list(
    establishmentId: string,
    filters: {
      status?: string;
      classId?: string;
      teacherId?: string;
      date?: string;
    } = {},
  ) {
    const where: any = { establishmentId };

    if (filters.status) {
      const map: Record<string, string[]> = {
        active: ['ACTIVE'],
        pending: ['SCHEDULED'],
        expired: ['EXPIRED'],
        closed: ['CLOSED', 'CANCELLED'],
      };
      where.status = { in: map[filters.status] ?? [filters.status] };
    }
    if (filters.classId) where.classId = filters.classId;
    if (filters.teacherId) where.teacherId = filters.teacherId;
    if (filters.date) where.date = new Date(filters.date);

    const seances = await this.prisma.classSession.findMany({
      where,
      orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
      take: 300,
      include: {
        subject: true,
        class: true,
        teacher: true,
        attendanceRecords: { select: { status: true } },
      },
    });

    return seances.map((s) => this.mapSession(s));
  }

  async getById(establishmentId: string, id: string) {
    const s = await this.prisma.classSession.findFirst({
      where: { id, establishmentId },
      include: {
        subject: true,
        class: true,
        teacher: true,
        attendanceRecords: {
          include: { student: true },
          orderBy: { scannedAt: 'asc' },
        },
        fraudAlerts: {
          where: { status: { in: ['OPEN', 'CONFIRMED'] } },
          select: { id: true, type: true, severity: true, title: true },
        },
      },
    });
    if (!s) throw new NotFoundException('Séance introuvable');

    const base = this.mapSession({
      ...s,
      attendanceRecords: s.attendanceRecords.map((r) => ({ status: r.status })),
    });

    return {
      ...base,
      room: s.room,
      qrGeneratedAt: s.qrGeneratedAt?.toISOString() ?? null,
      qrRegenerations: s.qrRegenerations,
      fraudAlerts: s.fraudAlerts,
      attendances: s.attendanceRecords.map((r) => ({
        id: r.id,
        studentId: r.studentId,
        studentName: `${r.student.firstName} ${r.student.lastName}`,
        studentMatricule: r.student.matricule,
        status: mapAttendanceStatus(r.status),
        method: r.method === 'qr' ? 'qr' : 'manual',
        time: r.scannedAt?.toISOString().slice(11, 16) ?? '',
        deviceFingerprint: r.deviceFingerprint,
        ipAddress: r.ipAddress,
        corrected: !!r.correctedById,
      })),
    };
  }

  /** Vue « QR Codes » : état du jeton de chaque séance du jour. */
  async qrMonitor(establishmentId: string) {
    const aujourdhui = new Date();
    aujourdhui.setUTCHours(0, 0, 0, 0);

    const seances = await this.prisma.classSession.findMany({
      where: { establishmentId, date: aujourdhui },
      include: { subject: true, class: true, teacher: true },
      orderBy: { startTime: 'asc' },
    });

    const maintenant = Date.now();
    return seances.map((s) => ({
      sessionId: s.id,
      courseName: s.subject.name,
      className: s.class.name,
      teacherName: `${s.teacher.firstName} ${s.teacher.lastName}`,
      room: s.room,
      startTime: s.startTime,
      endTime: s.endTime,
      status: mapSessionStatus(s.status),
      hasQr: !!s.qrTokenHash,
      generatedAt: s.qrGeneratedAt?.toISOString() ?? null,
      expiresAt: s.qrValidUntil?.toISOString() ?? null,
      secondsRemaining: s.qrValidUntil
        ? Math.max(
            0,
            Math.round((s.qrValidUntil.getTime() - maintenant) / 1000),
          )
        : 0,
      regenerations: s.qrRegenerations,
    }));
  }

  /**
   * Relance une séance : repasse en ACTIVE et prolonge la validité du QR.
   * Refusée sur une séance annulée — il faut en recréer une.
   */
  async relaunch(admin: AdminContext, id: string) {
    const s = await this.prisma.classSession.findFirst({
      where: { id, establishmentId: admin.establishmentId },
      include: { subject: true, class: true },
    });
    if (!s) throw new NotFoundException('Séance introuvable');
    if (s.status === 'CANCELLED') {
      throw new BadRequestException(
        'Séance annulée : créez une nouvelle séance plutôt que de la relancer',
      );
    }

    const params = await this.settings.getRaw(admin.establishmentId);
    const validite = params.qrDefaultValidityMinutes;

    await this.prisma.classSession.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        qrValidUntil: new Date(Date.now() + validite * 60_000),
      },
    });

    await this.activity.log({
      establishmentId: admin.establishmentId,
      type: 'qr_regenerated',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: `Séance relancée par l'administration : ${s.subject.name} / ${s.class.name} (+${validite} min)`,
    });

    return {
      success: true,
      message: `Séance relancée pour ${validite} minutes`,
    };
  }

  /**
   * Clôture définitive : les étudiants sans pointage sont marqués absents.
   * Sans ce passage, un « non-scanné » reste indistinct d'un « non-inscrit ».
   */
  async close(admin: AdminContext, id: string) {
    const s = await this.prisma.classSession.findFirst({
      where: { id, establishmentId: admin.establishmentId },
      include: { subject: true, class: true },
    });
    if (!s) throw new NotFoundException('Séance introuvable');
    if (s.status === 'CLOSED') {
      return { success: true, message: 'Séance déjà fermée' };
    }

    const [inscrits, pointes] = await Promise.all([
      this.prisma.student.findMany({
        where: { classId: s.classId, status: 'active' },
        select: { id: true },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { sessionId: id },
        select: { studentId: true },
      }),
    ]);

    const dejaPointes = new Set(pointes.map((p) => p.studentId));
    const absents = inscrits.filter((e) => !dejaPointes.has(e.id));

    await this.prisma.$transaction([
      this.prisma.attendanceRecord.createMany({
        data: absents.map((e) => ({
          sessionId: id,
          studentId: e.id,
          status: 'absent' as const,
          method: 'manual' as const,
        })),
        skipDuplicates: true,
      }),
      this.prisma.classSession.update({
        where: { id },
        data: { status: 'CLOSED', qrValidUntil: new Date() },
      }),
    ]);

    this.gateway.emitSessionClosed(id);

    await this.activity.log({
      establishmentId: admin.establishmentId,
      type: 'session_closed',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: `Clôture administrative : ${s.subject.name} / ${s.class.name} — ${absents.length} absence(s) enregistrée(s)`,
    });

    return {
      success: true,
      message: `Séance fermée, ${absents.length} absence(s) enregistrée(s)`,
    };
  }

  private mapSession(s: any) {
    const total = s.expectedCount || s.class?.studentCount || 0;
    const presents = (s.attendanceRecords ?? []).filter(
      (r: any) => r.status === 'present' || r.status === 'late',
    ).length;

    return {
      id: s.id,
      courseName: s.subject.name,
      subjectCode: s.subject.code,
      className: s.class.name,
      teacherName: `${s.teacher.firstName} ${s.teacher.lastName}`,
      date: isoDate(s.date),
      startTime: s.startTime,
      endTime: s.endTime,
      status: mapSessionStatus(s.status),
      // Le jeton en clair n'est jamais exposé : seule sa présence est indiquée.
      qrToken: s.qrTokenHash ? 'actif' : null,
      expiresAt: s.qrValidUntil?.toISOString() ?? null,
      presentCount: presents,
      totalCount: total,
      attendanceRate: pourcentage(presents, total),
    };
  }
}
