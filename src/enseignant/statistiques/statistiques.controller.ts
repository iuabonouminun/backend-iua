/**
 * Contrôleur Statistiques — routes de calcul des statistiques
 */
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { EnseignantGuard } from '../../common/guards/enseignant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StatistiquesService } from './statistiques.service';

@Controller('enseignant')
@UseGuards(JwtAuthGuard, EnseignantGuard)
export class StatistiquesController {
  constructor(private readonly statistiquesService: StatistiquesService) {}

  /**
   * GET /api/enseignant/statistiques
   * Récupère les statistiques globales de l'enseignant
   */
  @Get('statistiques')
  async statistiquesGlobales(@CurrentUser() user: { id: string }) {
    return this.statistiquesService.statistiquesGlobales(user.id);
  }

  /**
   * GET /api/enseignant/statistiques/classes
   * Récupère les statistiques par classe
   */
  @Get('statistiques/classes')
  async statistiquesParClasse(@CurrentUser() user: { id: string }) {
    return this.statistiquesService.statistiquesParClasse(user.id);
  }

  /**
   * GET /api/enseignant/statistiques/cours
   * Récupère les statistiques par cours (matière)
   */
  @Get('statistiques/cours')
  async statistiquesParCours(@CurrentUser() user: { id: string }) {
    return this.statistiquesService.statistiquesParCours(user.id);
  }
}
