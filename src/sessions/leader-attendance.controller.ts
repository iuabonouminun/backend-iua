/**
 * Routes d'auto-pointage du chef de classe.
 * Mêmes gardes que SessionsController : étudiant authentifié + statut de chef.
 */
import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { EtudiantJwtAuthGuard } from '../common/guards/etudiant-jwt-auth.guard';
import { EtudiantGuard } from '../common/guards/etudiant.guard';
import { LeaderGuard } from '../common/guards/leader.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { LeaderAttendanceService } from './leader-attendance.service';

@Controller('sessions')
@UseGuards(EtudiantJwtAuthGuard, EtudiantGuard, LeaderGuard)
export class LeaderAttendanceController {
  constructor(private readonly service: LeaderAttendanceService) {}

  /** POST /api/sessions/:id/ma-presence */
  @Post(':id/ma-presence')
  async pointer(
    @CurrentUser() user: { id: string },
    @Param('id') sessionId: string,
  ) {
    return this.service.pointerChef(user.id, sessionId);
  }

  /** GET /api/sessions/:id/ma-presence */
  @Get(':id/ma-presence')
  async etat(
    @CurrentUser() user: { id: string },
    @Param('id') sessionId: string,
  ) {
    return this.service.etatPresenceChef(user.id, sessionId);
  }
}
