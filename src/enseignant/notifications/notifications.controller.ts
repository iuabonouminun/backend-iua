/**
 * Contrôleur Notifications — routes de gestion des notifications
 */
import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { EnseignantGuard } from '../../common/guards/enseignant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@Controller('enseignant')
@UseGuards(JwtAuthGuard, EnseignantGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * GET /api/enseignant/notifications
   * Récupère les notifications de l'enseignant (paramètre optionnel: ?nonLues=true)
   */
  @Get('notifications')
  async consulterNotifications(
    @CurrentUser() user: { externalUserId: string },
    @Query('nonLues') nonLues?: string,
  ) {
    return this.notificationsService.consulterNotifications(
      user.externalUserId,
      nonLues === 'true',
    );
  }

  /**
   * GET /api/enseignant/notifications/compteur
   * Récupère le nombre de notifications non lues
   */
  @Get('notifications/compteur')
  async compterNonLues(@CurrentUser() user: { externalUserId: string }) {
    return this.notificationsService.compterNonLues(user.externalUserId);
  }

  /**
   * PATCH /api/enseignant/notifications/:id/lue
   * Marque une notification comme lue
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

  /**
   * PATCH /api/enseignant/notifications/toutes-lues
   * Marque toutes les notifications comme lues
   */
  @Patch('notifications/toutes-lues')
  async marquerToutesCommeLues(@CurrentUser() user: { externalUserId: string }) {
    return this.notificationsService.marquerToutesCommeLues(user.externalUserId);
  }
}
