/**
 * Service Notifications — gère la réception et le marquage des notifications
 * Les notifications sont ciblées par externalUserId de l'enseignant
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Récupère toutes les notifications de l'enseignant connecté
   * @param externalUserId Identifiant externe de l'enseignant
   * @param onlyUnread Si true, ne renvoie que les notifications non lues
   */
  async consulterNotifications(externalUserId: string, onlyUnread?: boolean) {
    return this.prisma.notification.findMany({
      where: {
        recipientExternalUserId: externalUserId,
        ...(onlyUnread ? { read: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Marque une notification comme lue
   * @param externalUserId Identifiant externe de l'enseignant
   * @param notificationId Identifiant de la notification
   */
  async marquerCommeLue(externalUserId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification introuvable');
    }

    // Vérifie que la notification appartient bien à cet enseignant
    if (notification.recipientExternalUserId !== externalUserId) {
      throw new NotFoundException('Notification introuvable');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });
  }

  /**
   * Marque toutes les notifications de l'enseignant comme lues
   * @param externalUserId Identifiant externe de l'enseignant
   */
  async marquerToutesCommeLues(externalUserId: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        recipientExternalUserId: externalUserId,
        read: false,
      },
      data: { read: true },
    });

    return { modifiees: result.count };
  }

  /**
   * Récupère le nombre de notifications non lues
   * @param externalUserId Identifiant externe de l'enseignant
   */
  async compterNonLues(externalUserId: string) {
    const count = await this.prisma.notification.count({
      where: {
        recipientExternalUserId: externalUserId,
        read: false,
      },
    });

    return { nonLues: count };
  }
}
