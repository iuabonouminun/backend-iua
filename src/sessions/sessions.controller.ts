import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { EtudiantJwtAuthGuard } from '../common/guards/etudiant-jwt-auth.guard';
import { EtudiantGuard } from '../common/guards/etudiant.guard';
import { LeaderGuard } from '../common/guards/leader.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SessionsService } from './sessions.service';
import { CreerSessionDto } from './dto/creer-session.dto';

@Controller('sessions')
@UseGuards(EtudiantJwtAuthGuard, EtudiantGuard, LeaderGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  /** POST /api/sessions */
  @Post()
  async creerSession(
    @CurrentUser() user: { id: string },
    @Body() dto: CreerSessionDto,
  ) {
    return this.sessionsService.creerSession(user.id, dto);
  }

  /** GET /api/sessions/:id */
  @Get(':id')
  async consulterSession(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.sessionsService.consulterSession(user.id, id);
  }

  /** POST /api/sessions/:id/qr */
  @Post(':id/qr')
  async genererQr(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.sessionsService.genererQr(user.id, id);
  }

  /** POST /api/sessions/:id/close */
  @Post(':id/close')
  async cloturerSession(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.sessionsService.cloturerSession(user.id, id);
  }

  /** GET /api/sessions/:id/attendances */
  @Get(':id/attendances')
  async listerPresences(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.sessionsService.listerPresences(user.id, id);
  }
}
