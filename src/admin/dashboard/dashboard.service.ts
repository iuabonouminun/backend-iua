/**
 * Tableau de bord administrateur.
 *
 * Renvoie exactement la forme DashboardStats attendue par admin-app, plus un
 * bloc `fraud` et un bloc `alerts` (conflits d'emploi du temps, séances
 * bloquées, classes sans chef) — les points qui demandent une action.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FraudService } from '../fraud/fraud.service';
import { AdminSettingsService } from '../settings/admin-settings.service';
import { minutesDepuisMinuit, pourcentage } from '../common/mappers';

const JOURS_TENDANCE = 14;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fraud: FraudService,
    private readonly settings: AdminSettingsService,
  ) {}

  async stats(establishmentId: string) {
    const aujourdhui = new Date();
    aujourdhui.setUTCHours(0, 0, 0, 0);
    const debutTendance = new Date(
      aujourdhui.getTime() - JOURS_TENDANCE * 86_400_000,
    );

    const [
      totalStudents,
      totalTeachers,
      totalClasses,
      totalSubjects,
      seancesDuJour,
      recordsDuJour,
      recordsTendance,
      fraudStats,
    ] = await Promise.all([
      this.prisma.student.count({ where: { establishmentId, status: 'active' } }),
      this.prisma.teacher.count({ where: { establishmentId, status: 'active' } }),
      this.prisma.schoolClass.count({ where: { establishmentId } }),
      this.prisma.subject.count({ where: { establishmentId } }),
      this.prisma.classSession.count({
        where: { establishmentId, date: aujourdhui },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { session: { establishmentId, date: aujourdhui } },
        select: {
          status: true,
          rejectionReason: true,
          session: {
            select: {
              class: { select: { name: true } },
              subject: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.attendanceRecord.findMany({
        where: {
          session: {
            establishmentId,
            date: { gte: debutTendance, lte: aujourdhui },
          },
        },
        select: { status: true, session: { select: { date: true } } },
      }),
      this.fraud.stats(establishmentId),
    ]);

    const presentToday = recordsDuJour.filter(
      (r) => r.status === 'present' || r.status === 'late',
    ).length;
    const absentToday = recordsDuJour.filter((r) => r.status === 'absent').length;

    /* --- Répartition par classe --- */
    const parClasse = new Map<string, { present: number; absent: number }>();
    for (const r of recordsDuJour) {
      const nom = r.session.class.name;
      const e = parClasse.get(nom) ?? { present: 0, absent: 0 };
      if (r.status === 'absent') e.absent += 1;
      else e.present += 1;
      parClasse.set(nom, e);
    }

    /* --- Taux par matière --- */
    const parMatiere = new Map<string, { ok: number; total: number }>();
    for (const r of recordsDuJour) {
      const nom = r.session.subject.name;
      const e = parMatiere.get(nom) ?? { ok: 0, total: 0 };
      e.total += 1;
      if (r.status !== 'absent') e.ok += 1;
      parMatiere.set(nom, e);
    }

    /* --- Tendance sur 14 jours --- */
    const parJour = new Map<string, { ok: number; total: number }>();
    for (const r of recordsTendance) {
      const jour = r.session.date.toISOString().slice(0, 10);
      const e = parJour.get(jour) ?? { ok: 0, total: 0 };
      e.total += 1;
      if (r.status !== 'absent') e.ok += 1;
      parJour.set(jour, e);
    }

    /* --- Motifs de rejet --- */
    const motifs = new Map<string, number>();
    for (const r of recordsDuJour) {
      if (!r.rejectionReason) continue;
      const libelle = LIBELLES_MOTIF[r.rejectionReason] ?? r.rejectionReason;
      motifs.set(libelle, (motifs.get(libelle) ?? 0) + 1);
    }

    return {
      totalStudents,
      totalTeachers,
      totalClasses,
      totalSubjects,
      todaySessions: seancesDuJour,
      presentToday,
      absentToday,
      attendanceRate: pourcentage(presentToday, recordsDuJour.length),
      attendanceByClass: [...parClasse.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.present + b.absent - (a.present + a.absent))
        .slice(0, 10),
      attendanceBySubject: [...parMatiere.entries()]
        .map(([name, v]) => ({ name, rate: pourcentage(v.ok, v.total) }))
        .slice(0, 10),
      attendanceTrend: [...parJour.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, rate: pourcentage(v.ok, v.total) })),
      absenceReasons: [...motifs.entries()].map(([reason, count]) => ({
        reason,
        count,
      })),
      fraud: {
        openAlerts: fraudStats.ouvertes,
        criticalAlerts: fraudStats.parSeverite.CRITICAL,
        riskIndex: fraudStats.indiceRisque,
        last7Days: fraudStats.derniers7Jours,
      },
      alerts: await this.pointsDAttention(establishmentId),
    };
  }

  /** Ce qui demande une décision de l'admin aujourd'hui. */
  private async pointsDAttention(establishmentId: string) {
    const [creneaux, sansChef, seancesOuvertes, comptesSuspendus] =
      await Promise.all([
        this.prisma.scheduleEntry.findMany({
          where: { class: { establishmentId } },
          select: {
            id: true,
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            roomId: true,
            teacherId: true,
          },
        }),
        this.prisma.schoolClass.count({
          where: { establishmentId, leaderId: null },
        }),
        this.prisma.classSession.count({
          where: {
            establishmentId,
            status: 'ACTIVE',
            date: { lt: new Date(new Date().setUTCHours(0, 0, 0, 0)) },
          },
        }),
        this.prisma.student.count({
          where: { establishmentId, status: 'suspended' },
        }),
      ]);

    let conflits = 0;
    for (let i = 0; i < creneaux.length; i += 1) {
      for (let j = i + 1; j < creneaux.length; j += 1) {
        const a = creneaux[i];
        const b = creneaux[j];
        if (a.dayOfWeek !== b.dayOfWeek) continue;
        if (a.teacherId !== b.teacherId && a.roomId !== b.roomId) continue;
        const da = minutesDepuisMinuit(a.startTime);
        const fa = minutesDepuisMinuit(a.endTime);
        const db = minutesDepuisMinuit(b.startTime);
        const fb = minutesDepuisMinuit(b.endTime);
        if ([da, fa, db, fb].some((v) => v === null)) continue;
        if (da! < fb! && db! < fa!) conflits += 1;
      }
    }

    return {
      scheduleConflicts: conflits,
      classesWithoutLeader: sansChef,
      staleActiveSessions: seancesOuvertes,
      suspendedStudents: comptesSuspendus,
    };
  }
}

const LIBELLES_MOTIF: Record<string, string> = {
  expired_qr: 'QR expiré',
  duplicate_scan: 'Double scan',
  wrong_session: 'Mauvaise séance',
  unknown_student: 'Étudiant inconnu',
  other: 'Autre',
};
