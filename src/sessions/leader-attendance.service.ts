/**
 * Auto-pointage du chef de classe.
 *
 * Le problème : le chef affiche le QR Code sur son écran. Il ne peut pas se
 * scanner lui-même — il faudrait un deuxième téléphone. Résultat, dans la
 * version actuelle, le délégué finit systématiquement marqué absent du cours
 * qu'il a lui-même ouvert. C'est le bug le plus visible du système pour
 * l'utilisateur final.
 *
 * La solution retenue : une route dédiée, réservée au chef (ou à son
 * suppléant) de la classe concernée, qui enregistre SA présence sans passer
 * par le scan. Elle est volontairement plus stricte que le scan normal :
 *
 *   - un seul auto-pointage possible (contrainte unique sessionId+studentId) ;
 *   - uniquement sur une séance ACTIVE dont le QR est encore valide — le chef
 *     ne peut pas se pointer après coup sur une séance qu'il a ratée ;
 *   - uniquement sur sa propre classe ;
 *   - la présence est enregistrée avec method = 'manual' et un marqueur clair
 *     dans le champ correctionNote, pour rester distinguable d'un vrai scan à
 *     l'audit et dans le moteur anti-fraude.
 *
 * Ce dernier point est important : un auto-pointage n'a pas la même valeur de
 * preuve qu'un scan. Le tracer comme tel évite de créer un angle mort où le
 * délégué serait le seul étudiant jamais contrôlable.
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceGateway } from '../realtime/attendance.gateway';

@Injectable()
export class LeaderAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceGateway: AttendanceGateway,
  ) {}

  /**
   * POST /api/sessions/:id/ma-presence
   * Le chef de classe (ou son suppléant) enregistre sa propre présence.
   */
  async pointerChef(chefId: string, sessionId: string) {
    const chef = await this.prisma.student.findUnique({
      where: { id: chefId },
    });
    if (!chef) throw new NotFoundException('Étudiant introuvable');

    if (chef.status !== 'active') {
      throw new ForbiddenException("Votre compte n'est pas actif");
    }

    const session = await this.prisma.classSession.findUnique({
      where: { id: sessionId },
      include: {
        subject: { select: { name: true } },
        teacher: { select: { firstName: true, lastName: true } },
      },
    });
    if (!session) throw new NotFoundException('Séance introuvable');

    if (session.classId !== chef.classId) {
      throw new ForbiddenException(
        "Cette séance n'appartient pas à votre classe",
      );
    }

    // Double vérification du statut de chef : le guard le fait déjà, mais on
    // ne s'appuie jamais sur un seul niveau pour une écriture de présence.
    const classe = await this.prisma.schoolClass.findUnique({
      where: { id: chef.classId },
      select: { leaderId: true, deputyLeaderId: true },
    });
    const estChef =
      classe?.leaderId === chef.id || classe?.deputyLeaderId === chef.id;
    if (!estChef) {
      throw new ForbiddenException(
        'Seul le chef de classe ou son suppléant peut utiliser cette fonction',
      );
    }

    if (session.status !== 'ACTIVE') {
      throw new BadRequestException(
        "La séance n'est pas active : ouvrez d'abord le pointage.",
      );
    }

    // Même exigence que pour un étudiant : le QR doit être en cours de
    // validité. Sans cette règle, le chef pourrait se pointer n'importe quand.
    if (!session.qrValidUntil || session.qrValidUntil.getTime() < Date.now()) {
      throw new BadRequestException(
        'Le QR Code a expiré : régénérez-le avant de vous pointer.',
      );
    }

    const existante = await this.prisma.attendanceRecord.findUnique({
      where: {
        sessionId_studentId: { sessionId, studentId: chef.id },
      },
    });
    if (existante) {
      throw new BadRequestException(
        'Votre présence est déjà enregistrée pour cette séance.',
      );
    }

    const maintenant = new Date();

    await this.prisma.attendanceRecord.create({
      data: {
        sessionId,
        studentId: chef.id,
        status: 'present',
        scannedAt: maintenant,
        method: 'manual',
        correctionNote: 'Auto-pointage du chef de classe (affichage du QR)',
      },
    });

    const presentCount = await this.prisma.attendanceRecord.count({
      where: { sessionId, status: { in: ['present', 'late'] } },
    });

    this.attendanceGateway.emitPresenceUpdate(sessionId, presentCount);

    return {
      status: 'success' as const,
      message: 'Votre présence a été enregistrée',
      matiere: session.subject.name,
      enseignant: `${session.teacher.firstName} ${session.teacher.lastName}`,
      heure: maintenant.toTimeString().slice(0, 5),
      presentCount,
    };
  }

  /**
   * GET /api/sessions/:id/ma-presence
   * Permet au front du chef de savoir s'il doit afficher le bouton
   * « Je suis présent » ou l'état « présence enregistrée ».
   */
  async etatPresenceChef(chefId: string, sessionId: string) {
    const record = await this.prisma.attendanceRecord.findUnique({
      where: {
        sessionId_studentId: { sessionId, studentId: chefId },
      },
      select: { status: true, scannedAt: true, method: true },
    });

    return {
      pointee: !!record,
      statut: record?.status ?? null,
      heure: record?.scannedAt?.toTimeString().slice(0, 5) ?? null,
      methode: record?.method ?? null,
    };
  }
}
