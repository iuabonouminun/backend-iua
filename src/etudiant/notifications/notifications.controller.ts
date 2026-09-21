import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { EtudiantJwtAuthGuard } from '../../common/guards/etudiant-jwt-auth.guard';
import { EtudiantGuard } from '../../common/guards/etudiant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@Controller('etudiant')
@UseGuards(EtudiantJwtAuthGuard, EtudiantGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * GET /api/etudiant/notifications
   */
  @Get('notifications')
  async consulterNotifications(
    @CurrentUser() user: { externalUserId: string },
  ) {
    return this.notificationsService.consulterNotifications(
      user.externalUserId,
    );
  }

  /**
   * PATCH /api/etudiant/notifications/:id/lue
   */
  @Patch('notifications/:id/lue')
  async marquerCommeLue(
    @CurrentUser() user: { externalUserId: string },
    @Param('id') notificationId: string,
  ) {
    return this.notificationsService.marquerCommeLue(
      user.externalUserId,
      notificationId,
    );
  }
}
