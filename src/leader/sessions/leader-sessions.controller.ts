import { Controller, Get, UseGuards } from '@nestjs/common';
import { EtudiantJwtAuthGuard } from '../../common/guards/etudiant-jwt-auth.guard';
import { EtudiantGuard } from '../../common/guards/etudiant.guard';
import { LeaderGuard } from '../../common/guards/leader.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SessionsService } from '../../sessions/sessions.service';

@Controller('leader')
@UseGuards(EtudiantJwtAuthGuard, EtudiantGuard, LeaderGuard)
export class LeaderSessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  /** GET /api/leader/sessions */
  @Get('sessions')
  async listerSessions(@CurrentUser() user: { id: string }) {
    return this.sessionsService.listerSessionsDeLaClasse(user.id);
  }
}
