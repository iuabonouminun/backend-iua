/**
 * Contrôleur Historique — routes de consultation de l'historique
 */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { EnseignantGuard } from '../../common/guards/enseignant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { HistoriqueService } from './historique.service';

@Controller('enseignant')
@UseGuards(JwtAuthGuard, EnseignantGuard)
export class HistoriqueController {
  constructor(private readonly historiqueService: HistoriqueService) {}

  /**
   * GET /api/enseignant/historique
   * Récupère l'historique des sessions (paramètres optionnels: ?statut=CLOSED&classeId=xxx)
   */
  @Get('historique')
  async historiqueSessions(
    @CurrentUser() user: { id: string },
    @Query('statut') statut?: string,
    @Query('classeId') classeId?: string,
  ) {
    if (statut || classeId) {
      // Si on filtre par statut, on retourne les sessions filtrées
      return this.historiqueService.historiqueSessions(user.id, statut);
    }
    return this.historiqueService.historiqueSessions(user.id);
  }

  /**
   * GET /api/enseignant/historique/presences
   * Récupère les présences par classe (paramètre optionnel: ?classeId=xxx)
   */
  @Get('historique/presences')
  async presencesParClasse(
    @CurrentUser() user: { id: string },
    @Query('classeId') classeId?: string,
  ) {
    return this.historiqueService.presencesParClasse(user.id, classeId);
  }

  /**
   * GET /api/enseignant/historique/absences
   * Récupère l'historique des absences (paramètre optionnel: ?classeId=xxx)
   */
  @Get('historique/absences')
  async historiqueAbsences(
    @CurrentUser() user: { id: string },
    @Query('classeId') classeId?: string,
  ) {
    return this.historiqueService.historiqueAbsences(user.id, classeId);
  }

  /**
   * GET /api/enseignant/historique/retards
   * Récupère l'historique des retards (paramètre optionnel: ?classeId=xxx)
   */
  @Get('historique/retards')
  async historiqueRetards(
    @CurrentUser() user: { id: string },
    @Query('classeId') classeId?: string,
  ) {
    return this.historiqueService.historiqueRetards(user.id, classeId);
  }
}
