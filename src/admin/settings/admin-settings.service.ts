/**
 * Paramètres de l'établissement.
 * Ces réglages pilotent aussi le moteur anti-fraude (rayon du campus,
 * tolérance de retard, seuils de scan éclair...).
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../common/activity.service';
import { UpdateSettingsDto } from '../dto/admin.dto';

@Injectable()
export class AdminSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /** Crée la ligne de paramètres à la volée si elle n'existe pas encore. */
  async getRaw(establishmentId: string) {
    const existant = await this.prisma.establishmentSettings.findUnique({
      where: { establishmentId },
    });
    if (existant) return existant;
    return this.prisma.establishmentSettings.create({
      data: { establishmentId },
    });
  }

  /** Format attendu par admin-app (types/index.ts → AppSettings). */
  async get(establishmentId: string) {
    const s = await this.getRaw(establishmentId);
    const etab = await this.prisma.establishment.findUnique({
      where: { id: establishmentId },
      select: { name: true },
    });

    return {
      institutionName: etab?.name ?? '',
      academicYear: s.academicYear,
      currentSemester: s.currentSemester as 'S1' | 'S2',
      qrValidityMinutes: s.qrDefaultValidityMinutes,
      lateToleranceMinutes: s.lateToleranceMinutes,
      autoCloseSessions: s.autoCloseSessions,
      allowManualAttendance: s.allowManualAttendance,
      attendanceAlertThreshold: s.attendanceAlertThreshold,
      notifyOnScheduleConflict: s.notifyImminentSession,
      notifyOnLowAttendance: s.notifyQrExpiring,
      notifyOnSessionExpired: s.notifyCancelledSession,
      defaultExportFormat: s.defaultExportFormat as 'pdf' | 'docx' | 'xlsx',
      fraud: {
        enabled: s.fraudDetectionEnabled,
        campusLatitude: s.campusLatitude,
        campusLongitude: s.campusLongitude,
        campusRadiusMeters: s.campusRadiusMeters,
        maxDevicesPerStudent: s.maxDevicesPerStudent,
        maxQrRegenerations: s.maxQrRegenerations,
        burstScanWindowSeconds: s.burstScanWindowSeconds,
        burstScanThreshold: s.burstScanThreshold,
      },
    };
  }

  async update(
    establishmentId: string,
    dto: UpdateSettingsDto,
    actorName: string,
  ) {
    await this.getRaw(establishmentId);

    if (dto.institutionName) {
      await this.prisma.establishment.update({
        where: { id: establishmentId },
        data: { name: dto.institutionName },
      });
    }

    await this.prisma.establishmentSettings.update({
      where: { establishmentId },
      data: {
        academicYear: dto.academicYear,
        currentSemester: dto.currentSemester,
        qrDefaultValidityMinutes: dto.qrValidityMinutes,
        lateToleranceMinutes: dto.lateToleranceMinutes,
        autoCloseSessions: dto.autoCloseSessions,
        allowManualAttendance: dto.allowManualAttendance,
        attendanceAlertThreshold: dto.attendanceAlertThreshold,
        notifyImminentSession: dto.notifyOnScheduleConflict,
        notifyQrExpiring: dto.notifyOnLowAttendance,
        notifyCancelledSession: dto.notifyOnSessionExpired,
        defaultExportFormat: dto.defaultExportFormat,
        fraudDetectionEnabled: dto.fraudDetectionEnabled,
        campusLatitude: dto.campusLatitude,
        campusLongitude: dto.campusLongitude,
        campusRadiusMeters: dto.campusRadiusMeters,
        maxDevicesPerStudent: dto.maxDevicesPerStudent,
        maxQrRegenerations: dto.maxQrRegenerations,
        burstScanWindowSeconds: dto.burstScanWindowSeconds,
        burstScanThreshold: dto.burstScanThreshold,
      },
    });

    await this.activity.log({
      establishmentId,
      type: 'settings_changed',
      actorName,
      actorRole: 'admin',
      targetLabel: `Paramètres mis à jour : ${Object.keys(dto).join(', ')}`,
    });

    return { success: true, message: 'Paramètres enregistrés' };
  }
}
