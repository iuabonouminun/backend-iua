/**
 * Contrôleur Emploi du Temps — routes de consultation et filtrage
 */
import { Controller, Get, Query, BadRequestException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { EnseignantGuard } from '../../common/guards/enseignant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EmploiDuTempsService } from './emploi-du-temps.service';

@Controller('enseignant')
@UseGuards(JwtAuthGuard, EnseignantGuard)
export class EmploiDuTempsController {
  constructor(private readonly emploiService: EmploiDuTempsService) {}

  /**
   * GET /api/enseignant/emploi-du-temps
   * Récupère l'emploi du temps complet de l'enseignant
   * Paramètres optionnels : ?jour=1 (filtre par jour) ou ?jourDebut=1&jourFin=5 (filtre par semaine)
   */
  @Get('emploi-du-temps')
  async consulterEmploiDuTemps(
    @CurrentUser() user: { id: string },
    @Query('jour') jour?: string,
    @Query('jourDebut') jourDebut?: string,
    @Query('jourFin') jourFin?: string,
  ) {
    // Filtrage par jour
    if (jour) {
      const jourNum = parseInt(jour, 10);
      if (isNaN(jourNum) || jourNum < 1 || jourNum > 7) {
        throw new BadRequestException('Le paramètre "jour" doit être un nombre entre 1 et 7');
      }
      return this.emploiService.filtrerParJour(user.id, jourNum);
    }

    // Filtrage par semaine
    if (jourDebut && jourFin) {
      const debut = parseInt(jourDebut, 10);
      const fin = parseInt(jourFin, 10);
      if (isNaN(debut) || isNaN(fin) || debut < 1 || debut > 7 || fin < 1 || fin > 7) {
        throw new BadRequestException('Les paramètres "jourDebut" et "jourFin" doivent être des nombres entre 1 et 7');
      }
      if (debut > fin) {
        throw new BadRequestException('Le jour de début doit être antérieur ou égal au jour de fin');
      }
      return this.emploiService.filtrerParSemaine(user.id, debut, fin);
    }

    // Aucun filtre : retourne tout
    return this.emploiService.consulterEmploiDuTemps(user.id);
  }
}
