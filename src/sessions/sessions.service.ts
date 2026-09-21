import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceGateway } from '../realtime/attendance.gateway';
import { CreerSessionDto } from './dto/creer-session.dto';
import { SessionResolverService } from './session-resolver.service';

const QR_VALID_MINUTES = 15;

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceGateway: AttendanceGateway,
    private readonly sessionResolver: SessionResolverService,
  ) {}

  /**
   * Vérifie que la séance appartient bien à la classe du chef connecté.
   * Sécurité : LeaderGuard confirme le statut de chef, mais chaque
   * opération doit en plus confirmer que CETTE séance appartient à SA classe.
   */
  private async verifierSessionDuChef(chefId: string, sessionId: string) {
    const chef = await this.prisma.student.findUnique({
      where: { id: chefId },
    });
    if (!chef) throw new NotFoundException('Étudiant introuvable');

    const session = await this.prisma.classSession.findUnique({
      where: { id: sessionId },
      include: {
        subject: { select: { name: true } },
        teacher: { select: { firstName: true, lastName: true } },
        class: { select: { name: true } },
      },
    });
    if (!session) throw new NotFoundException('Séance introuvable');

    if (session.classId !== chef.classId) {
      throw new ForbiddenException(
        "Cette séance n'appartient pas à votre classe",
      );
    }

    return { chef, session };
  }

  /**
   * POST /api/sessions
   * Le chef choisit une matière + un créneau ; teacherId et room sont
   * déduits de l'emploi du temps de la classe si non fournis explicitement.
   */
  async creerSession(chefId: string, dto: CreerSessionDto) {
    const chef = await this.prisma.student.findUnique({
      where: { id: chefId },
    });
    if (!chef) throw new NotFoundException('Étudiant introuvable');

    let teacherId = dto.teacherId;
    let room = dto.room;

    if (!teacherId || !room) {
      const jourSemaine = new Date(dto.date).getDay() || 7; // 1=Lundi..7=Dimanche
      const creneau = await this.prisma.scheduleEntry.findFirst({
        where: {
          classId: chef.classId,
          subjectId: dto.subjectId,
          dayOfWeek: jourSemaine,
          startTime: dto.startTime,
        },
        include: { room: { select: { name: true } } },
      });
      if (!creneau) {
        throw new BadRequestException(
          "Impossible de déduire l'enseignant/la salle depuis l'emploi du temps : précisez teacherId et room.",
        );
      }
      teacherId = teacherId ?? creneau.teacherId;
      room = room ?? creneau.room.name;
    }

    // Anti-doublon : si l'enseignant a déjà créé cette même séance de son
    // côté (POST /api/enseignant/sessions-presence), on la rejoint au lieu
    // d'en recréer une deuxième, vide, pour le même cours.
    const { session, creee } = await this.sessionResolver.trouverOuCreer({
      classId: chef.classId,
      subjectId: dto.subjectId,
      teacherId,
      room,
      date: dto.date,
      startTime: dto.startTime,
      endTime: dto.endTime,
      establishmentId: chef.establishmentId,
    });

    if (creee) {
      this.prisma.activityEvent
        .create({
          data: {
            establishmentId: chef.establishmentId,
            type: 'qr_generated',
            actorName: `${chef.firstName} ${chef.lastName}`,
            actorRole: 'class_leader',
            targetLabel: `Séance ouverte par le chef de classe (${room})`,
          },
        })
        .catch(() => undefined);
    }

    return {
      ...this.formaterSession(session, 0),
      message: creee
        ? 'Séance ouverte'
        : 'Séance déjà ouverte pour ce cours — vous l’avez rejointe',
    };
  }

  /**
   * GET /api/sessions/:id
   */
  async consulterSession(chefId: string, sessionId: string) {
    const { session } = await this.verifierSessionDuChef(chefId, sessionId);
    const presentCount = await this.prisma.attendanceRecord.count({
      where: { sessionId, status: { in: ['present', 'late'] } },
    });
    return this.formaterSession(session, presentCount);
  }

  /**
   * POST /api/sessions/:id/qr
   * Génère un nouveau secret côté serveur — le frontend ne fabrique JAMAIS
   * le token. Seul le hash (sha256) est stocké ; le secret en clair n'est
   * renvoyé qu'une fois, pour être encodé dans le QR Code.
   */
  async genererQr(chefId: string, sessionId: string) {
    const { session } = await this.verifierSessionDuChef(chefId, sessionId);

    if (session.status === 'CLOSED' || session.status === 'CANCELLED') {
      throw new BadRequestException(
        'Impossible de générer un QR pour une séance fermée',
      );
    }

    const secret = randomBytes(20).toString('hex');
    const qrTokenHash = createHash('sha256').update(secret).digest('hex');
    const maintenant = new Date();
    const qrValidUntil = new Date(
      maintenant.getTime() + QR_VALID_MINUTES * 60 * 1000,
    );

    const sessionMaj = await this.prisma.classSession.update({
      where: { id: sessionId },
      data: {
        status: 'ACTIVE',
        qrTokenHash,
        qrGeneratedAt: maintenant,
        qrValidUntil,
        qrRegenerations: { increment: 1 },
      },
      include: {
        subject: { select: { name: true } },
        teacher: { select: { firstName: true, lastName: true } },
        class: { select: { name: true } },
      },
    });

    const presentCount = await this.prisma.attendanceRecord.count({
      where: { sessionId, status: { in: ['present', 'late'] } },
    });

    return {
      ...this.formaterSession(sessionMaj, presentCount),
      // Contenu à encoder dans le QR Code affiché — jamais reconstructible
      // depuis les autres champs (le hash seul ne suffit pas à le retrouver).
      qrContent: `${sessionMaj.id}.${secret}`,
    };
  }

  /**
   * POST /api/sessions/:id/close
   */
  async cloturerSession(chefId: string, sessionId: string) {
    const { session } = await this.verifierSessionDuChef(chefId, sessionId);

    if (session.status !== 'ACTIVE') {
      throw new BadRequestException(
        "La session n'est pas active et ne peut pas être clôturée",
      );
    }

    const etudiantsClasse = await this.prisma.student.findMany({
      where: { classId: session.classId, status: 'active' },
      select: { id: true },
    });
    const presencesExistantes = await this.prisma.attendanceRecord.findMany({
      where: { sessionId },
      select: { studentId: true },
    });
    const enregistres = new Set(presencesExistantes.map((p) => p.studentId));
    const absentsAAjouter = etudiantsClasse
      .filter((e) => !enregistres.has(e.id))
      .map((e) => ({ sessionId, studentId: e.id, status: 'absent' as const }));

    if (absentsAAjouter.length > 0) {
      await this.prisma.attendanceRecord.createMany({
        data: absentsAAjouter,
      });
    }

    const sessionFermee = await this.prisma.classSession.update({
      where: { id: sessionId },
      data: { status: 'CLOSED' },
      include: {
        subject: { select: { name: true } },
        teacher: { select: { firstName: true, lastName: true } },
        class: { select: { name: true } },
      },
    });

    this.attendanceGateway.emitSessionClosed(sessionId);

    const presentCount = await this.prisma.attendanceRecord.count({
      where: { sessionId, status: { in: ['present', 'late'] } },
    });

    return {
      ...this.formaterSession(sessionFermee, presentCount),
      absentsAutomatiques: absentsAAjouter.length,
    };
  }

  /**
   * GET /api/sessions/:id/attendances
   */
  async listerPresences(chefId: string, sessionId: string) {
    await this.verifierSessionDuChef(chefId, sessionId);

    const presences = await this.prisma.attendanceRecord.findMany({
      where: { sessionId },
      include: {
        student: {
          select: { id: true, matricule: true, firstName: true, lastName: true },
        },
      },
      orderBy: { student: { lastName: 'asc' } },
    });

    return presences.map((p) => ({
      id: p.id,
      studentId: p.studentId,
      matricule: p.student.matricule,
      nom: p.student.lastName,
      prenom: p.student.firstName,
      statut: p.status,
      scannedAt: p.scannedAt?.toISOString() ?? null,
    }));
  }

  /**
   * GET /api/leader/sessions — liste des séances de la classe du chef
   * (passées et à venir), utilisée pour choisir une séance à démarrer.
   */
  async listerSessionsDeLaClasse(chefId: string) {
    const chef = await this.prisma.student.findUnique({
      where: { id: chefId },
    });
    if (!chef) throw new NotFoundException('Étudiant introuvable');

    const sessions = await this.prisma.classSession.findMany({
      where: { classId: chef.classId },
      include: {
        subject: { select: { name: true } },
        teacher: { select: { firstName: true, lastName: true } },
        class: { select: { name: true } },
      },
      orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
    });

    return Promise.all(
      sessions.map(async (s) => {
        const presentCount = await this.prisma.attendanceRecord.count({
          where: { sessionId: s.id, status: { in: ['present', 'late'] } },
        });
        return this.formaterSession(s, presentCount);
      }),
    );
  }

  private formaterSession(session: any, presentCount: number) {
    return {
      id: session.id,
      matiere: session.subject.name,
      enseignant: `${session.teacher.firstName} ${session.teacher.lastName}`,
      classe: session.class.name,
      salle: session.room,
      date: session.date.toISOString().slice(0, 10),
      heureDebut: session.startTime,
      heureFin: session.endTime,
      statut: session.status,
      qrValidUntil: session.qrValidUntil
        ? session.qrValidUntil.toISOString()
        : null,
      presentCount,
      effectifAttendu: session.expectedCount,
    };
  }
}
