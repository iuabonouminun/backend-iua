/**
 * Notifications de l'espace administrateur.
 * Le journal d'activité est servi par ActivityService — ce service gère la
 * boîte de notifications de l'admin connecté.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminContext } from '../auth/current-admin.decorator';

const TYPE_VERS_NIVEAU: Record<string, 'info' | 'success' | 'warning' | 'error'> =
  {
    session_imminent: 'info',
    qr_available: 'success',
    qr_expiring: 'warning',
    session_cancelled: 'error',
    absence_recorded: 'warning',
    admin_info: 'info',
  };

@Injectable()
export class MonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  async list(admin: AdminContext) {
    const notifications = await this.prisma.notification.findMany({
      where: {
        establishmentId: admin.establishmentId,
        recipientExternalUserId: { in: [admin.id, 'ADMIN_BROADCAST'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return notifications.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.body,
      type: TYPE_VERS_NIVEAU[n.type] ?? 'info',
      timestamp: n.createdAt.toISOString(),
      read: n.read,
    }));
  }

  async markRead(admin: AdminContext, id: string, read: boolean) {
    const n = await this.prisma.notification.findFirst({
      where: { id, establishmentId: admin.establishmentId },
    });
    if (!n) throw new NotFoundException('Notification introuvable');

    await this.prisma.notification.update({ where: { id }, data: { read } });
    return { success: true };
  }

  async markAllRead(admin: AdminContext) {
    await this.prisma.notification.updateMany({
      where: {
        establishmentId: admin.establishmentId,
        recipientExternalUserId: { in: [admin.id, 'ADMIN_BROADCAST'] },
        read: false,
      },
      data: { read: true },
    });
    return { success: true };
  }

  async remove(admin: AdminContext, id: string) {
    const n = await this.prisma.notification.findFirst({
      where: { id, establishmentId: admin.establishmentId },
    });
    if (!n) throw new NotFoundException('Notification introuvable');

    await this.prisma.notification.delete({ where: { id } });
    return { success: true };
  }

  /** Utilitaire interne : pousser une notification à l'ensemble des admins. */
  async notifierAdmins(
    establishmentId: string,
    title: string,
    body: string,
  ): Promise<void> {
    await this.prisma.notification.create({
      data: {
        type: 'admin_info',
        title,
        body,
        establishmentId,
        recipientExternalUserId: 'ADMIN_BROADCAST',
      },
    });
  }
}
