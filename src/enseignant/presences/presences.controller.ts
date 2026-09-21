/**
 * Contrôleur Présences — gère les sessions et enregistrements de présence
 * Toutes les routes sont protégées par JWT + EnseignantGuard
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { EnseignantGuard } from '../../common/guards/enseignant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PresencesService } from './presences.service';
import { DemarrerSessionDto } from './dto/demarrer-session.dto';
import { EnregistrerPresenceDto } from './dto/enregistrer-presence.dto';
import { ModifierPresenceDto } from './dto/modifier-presence.dto';

@Controller('enseignant')
@UseGuards(JwtAuthGuard, EnseignantGuard)
export class PresencesController {
  constructor(private readonly presencesService: PresencesService) {}

  /**
   * GET /api/enseignant/sessions-presence/actives
   * Récupère les sessions de présence actives de l'enseignant
   */
  @Get('sessions-presence/actives')
  async consulterSessionsActives(@CurrentUser() user: { id: string }) {
    return this.presencesService.consulterSessionsActives(user.id);
  }

  /**
   * GET /api/enseignant/sessions-presence/:id
   * Récupère les détails d'une session avec les présences enregistrées
   */
  @Get('sessions-presence/:id')
  async consulterSession(
    @CurrentUser() user: { id: string },
    @Param('id') sessionId: string,
  ) {
    return this.presencesService.consulterSession(user.id, sessionId);
  }

  /**
   * POST /api/enseignant/sessions-presence
   * Démarre une nouvelle session de présence
   */
  @Post('sessions-presence')
  async demarrerSession(
    @CurrentUser() user: { id: string },
    @Body() dto: DemarrerSessionDto,
  ) {
    return this.presencesService.demarrerSession(user.id, dto);
  }

  /**
   * POST /api/enseignant/presences
   * Enregistre une présence/absence/retard pour un étudiant
   */
  @Post('presences')
  async enregistrerPresence(
    @CurrentUser() user: { id: string },
    @Body() dto: EnregistrerPresenceDto,
  ) {
    return this.presencesService.enregistrerPresence(user.id, dto.sessionId, dto);
  }

  /**
   * POST /api/enseignant/presences/absence
   * Enregistre une absence pour un étudiant
   */
  @Post('presences/absence')
  async enregistrerAbsence(
    @CurrentUser() user: { id: string },
    @Body() body: { sessionId: string; studentId: string },
  ) {
    return this.presencesService.enregistrerAbsence(
      user.id,
      body.sessionId,
      body.studentId,
    );
  }

  /**
   * POST /api/enseignant/presences/retard
   * Enregistre un retard pour un étudiant
   */
  @Post('presences/retard')
  async enregistrerRetard(
    @CurrentUser() user: { id: string },
    @Body() body: { sessionId: string; studentId: string },
  ) {
    return this.presencesService.enregistrerRetard(
      user.id,
      body.sessionId,
      body.studentId,
    );
  }

  /**
   * PATCH /api/enseignant/presences/:id
   * Modifie une présence existante (uniquement si la session est active)
   */
  @Patch('presences/:id')
  async modifierPresence(
    @CurrentUser() user: { id: string },
    @Param('id') presenceId: string,
    @Body() dto: ModifierPresenceDto,
  ) {
    return this.presencesService.modifierPresence(user.id, presenceId, dto);
  }

  /**
   * PATCH /api/enseignant/sessions-presence/:id/cloturer
   * Clôture une session de présence
   */
  @Patch('sessions-presence/:id/cloturer')
  async cloturerSession(
    @CurrentUser() user: { id: string },
    @Param('id') sessionId: string,
  ) {
    return this.presencesService.cloturerSession(user.id, sessionId);
  }
}
