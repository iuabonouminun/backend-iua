import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async consulterNotifications(externalUserId: string) {
    const notifications = await this.prisma.notification.findMany({
      where: { recipientExternalUserId: externalUserId },
      orderBy: { createdAt: 'desc' },
    });

    return notifications.map((n) => ({
      id: n.id,
      titre: n.title,
      message: n.body,
      date: n.createdAt.toISOString(),
      lu: n.read,
    }));
  }

  async marquerCommeLue(externalUserId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification || notification.recipientExternalUserId !== externalUserId) {
      throw new NotFoundException('Notification introuvable');
    }
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });
  }
}
