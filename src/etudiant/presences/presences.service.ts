import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceGateway } from '../../realtime/attendance.gateway';
import { ScannerQrDto } from './dto/scanner-qr.dto';

/**
 * Correspondance entre les statuts backend (AttendanceStatus Prisma) et les
 * libellés attendus par student-app. Le schéma actuel n'a pas de notion
 * d'absence "justifiée" (aucun workflow de justification côté admin pour
 * l'instant) : on mappe provisoirement `rejected` vers `justifie` en
 * attendant qu'un vrai statut de justification soit ajouté au schéma.
 */
const STATUT_BACKEND_VERS_FRONTEND: Record<string, string> = {
  present: 'present',
  late: 'retard',
  absent: 'absent',
  rejected: 'justifie',
};

const STATUT_FRONTEND_VERS_BACKEND: Record<string, string> = {
  present: 'present',
  retard: 'late',
  absent: 'absent',
  justifie: 'rejected',
};

function erreurScan(code: string, message: string) {
  return new BadRequestException({ status: 'error', code, message });
}

@Injectable()
export class PresencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceGateway: AttendanceGateway,
  ) {}

  /**
   * GET /api/etudiant/presences — historique filtrable + statistiques.
   */
  async getHistory(
    etudiantId: string,
    filters: { date?: string; matiere?: string; statut?: string },
  ) {
    const where: any = { studentId: etudiantId };

    if (filters.statut) {
      const statutBackend = STATUT_FRONTEND_VERS_BACKEND[filters.statut];
      if (statutBackend) where.status = statutBackend;
    }

    const sessionWhere: any = {};
    if (filters.date) sessionWhere.date = new Date(filters.date);
    if (filters.matiere) {
      sessionWhere.subject = {
        name: { contains: filters.matiere, mode: 'insensitive' },
      };
    }
    if (Object.keys(sessionWhere).length > 0) {
      where.session = sessionWhere;
    }

    const records = await this.prisma.attendanceRecord.findMany({
      where,
      include: {
        session: {
          include: {
            subject: { select: { name: true } },
            teacher: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { session: { date: 'desc' } },
    });

    const mapped = records.map((r) => ({
      id: r.id,
      courseId: r.sessionId,
      matiere: r.session.subject.name,
      enseignant: `${r.session.teacher.firstName} ${r.session.teacher.lastName}`,
      date: r.session.date.toISOString().slice(0, 10),
      heure: r.session.startTime,
      statut: STATUT_BACKEND_VERS_FRONTEND[r.status] ?? r.status,
    }));

    const allRecords = await this.prisma.attendanceRecord.findMany({
      where: { studentId: etudiantId },
      select: { status: true },
    });
    const total = allRecords.length;
    const presences = allRecords.filter((r) => r.status === 'present').length;
    const retards = allRecords.filter((r) => r.status === 'late').length;
    const absences = allRecords.filter((r) => r.status === 'absent').length;

    return {
      records: mapped,
      stats: {
        totalSeances: total,
        presences,
        absences,
        retards,
        tauxPresence: total > 0 ? Math.round((presences / total) * 100) : 0,
      },
    };
  }

  /**
   * POST /api/etudiant/presences/scan
   *
   * Le frontend ne valide JAMAIS lui-même une présence : cette méthode est
   * la SEULE source de vérité. Elle renvoie soit un succès, soit une erreur
   * typée parmi les cas prévus par student-app (ResultOverlay).
   */
  async submitScan(etudiantId: string, dto: ScannerQrDto) {
    const etudiant = await this.prisma.student.findUnique({
      where: { id: etudiantId },
    });
    if (!etudiant) {
      throw new NotFoundException('Étudiant introuvable');
    }
    if (etudiant.status !== 'active') {
      throw erreurScan(
        'ETUDIANT_NON_AUTORISE',
        "Votre compte n'est pas autorisé à valider une présence.",
      );
    }

    // Format attendu du token QR : "<sessionId>.<secret>" — le secret est
    // haché (sha256) et comparé au qrTokenHash stocké (jamais en clair).
    // Fallback : un token composé uniquement de l'id de séance reste accepté
    // pour les tests tant qu'aucun QR réel n'a été généré (qrTokenHash null).
    const [sessionIdBrut, secretBrut] = dto.token.split('.');
    const session = await this.prisma.classSession.findUnique({
      where: { id: sessionIdBrut || dto.token },
      include: {
        subject: { select: { name: true } },
        teacher: { select: { firstName: true, lastName: true } },
      },
    });

    if (!session) {
      throw erreurScan('QR_INVALIDE', "Ce QR Code n'est pas reconnu.");
    }

    if (session.qrTokenHash) {
      const secretValide =
        !!secretBrut &&
        createHash('sha256').update(secretBrut).digest('hex') ===
          session.qrTokenHash;
      if (!secretValide) {
        throw erreurScan('QR_INVALIDE', "Ce QR Code n'est pas reconnu.");
      }
    }

    if (session.qrValidUntil && session.qrValidUntil.getTime() < Date.now()) {
      throw erreurScan('QR_EXPIRE', 'Ce QR Code a expiré.');
    }

    if (session.status === 'CLOSED' || session.status === 'CANCELLED') {
      throw erreurScan('SESSION_FERMEE', 'La session de présence est fermée.');
    }

    if (session.status === 'EXPIRED') {
      throw erreurScan('QR_EXPIRE', 'Ce QR Code a expiré.');
    }

    if (session.status === 'SCHEDULED') {
      throw erreurScan(
        'SESSION_FERMEE',
        "La session n'a pas encore démarré.",
      );
    }

    if (session.classId !== etudiant.classId) {
      throw erreurScan(
        'MAUVAISE_CLASSE',
        "Ce QR Code ne correspond pas à votre classe.",
      );
    }

    const dejaEnregistre = await this.prisma.attendanceRecord.findUnique({
      where: {
        sessionId_studentId: {
          sessionId: session.id,
          studentId: etudiant.id,
        },
      },
    });
    if (dejaEnregistre) {
      throw erreurScan(
        'DEJA_PRESENT',
        'Votre présence a déjà été enregistrée pour ce cours.',
      );
    }

    const maintenant = new Date();
    await this.prisma.attendanceRecord.create({
      data: {
        sessionId: session.id,
        studentId: etudiant.id,
        status: 'present',
        scannedAt: maintenant,
      },
    });

    const presentCount = await this.prisma.attendanceRecord.count({
      where: { sessionId: session.id, status: { in: ['present', 'late'] } },
    });
    this.attendanceGateway.emitPresenceUpdate(session.id, presentCount);

    this.prisma.activityEvent
      .create({
        data: {
          establishmentId: etudiant.establishmentId,
          type: 'attendance_scan',
          actorName: `${etudiant.firstName} ${etudiant.lastName}`,
          actorRole: 'student',
          targetLabel: `Scan QR : ${session.subject.name} (${etudiant.matricule ?? ''})`,
        },
      })
      .catch(() => undefined);

    return {
      status: 'success' as const,
      matiere: session.subject.name,
      enseignant: `${session.teacher.firstName} ${session.teacher.lastName}`,
      date: session.date.toISOString().slice(0, 10),
      heure: maintenant.toTimeString().slice(0, 5),
      salle: session.room,
    };
  }
}
