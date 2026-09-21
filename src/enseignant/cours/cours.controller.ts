/**
 * Contrôleur Cours — routes de consultation des cours, classes et étudiants
 */
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { EnseignantGuard } from '../../common/guards/enseignant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CoursService } from './cours.service';

@Controller('enseignant')
@UseGuards(JwtAuthGuard, EnseignantGuard)
export class CoursController {
  constructor(private readonly coursService: CoursService) {}

  /**
   * GET /api/enseignant/cours
   * Récupère tous les cours de l'enseignant connecté
   */
  @Get('cours')
  async consulterCours(@CurrentUser() user: { id: string }) {
    return this.coursService.consulterCours(user.id);
  }

  /**
   * GET /api/enseignant/cours/:id
   * Récupère les détails d'un cours spécifique
   */
  @Get('cours/:id')
  async consulterDetailsCours(
    @CurrentUser() user: { id: string },
    @Param('id') coursId: string,
  ) {
    return this.coursService.consulterDetailsCours(user.id, coursId);
  }

  /**
   * GET /api/enseignant/classes
   * Récupère les classes associées à l'enseignant
   */
  @Get('classes')
  async consulterClasses(@CurrentUser() user: { id: string }) {
    return this.coursService.consulterClasses(user.id);
  }

  /**
   * GET /api/enseignant/classes/:classeId/etudiants
   * Récupère les étudiants d'une classe spécifique (uniquement si l'enseignant est assigné)
   */
  @Get('classes/:classeId/etudiants')
  async consulterEtudiantsClasse(
    @CurrentUser() user: { id: string },
    @Param('classeId') classeId: string,
  ) {
    return this.coursService.consulterEtudiantsClasse(user.id, classeId);
  }
}
