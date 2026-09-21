import { Controller, Get, UseGuards } from '@nestjs/common';
import { EtudiantJwtAuthGuard } from '../../common/guards/etudiant-jwt-auth.guard';
import { EtudiantGuard } from '../../common/guards/etudiant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CoursService } from './cours.service';

@Controller('etudiant')
@UseGuards(EtudiantJwtAuthGuard, EtudiantGuard)
export class CoursController {
  constructor(private readonly coursService: CoursService) {}

  /**
   * GET /api/etudiant/cours
   */
  @Get('cours')
  async consulterCours(@CurrentUser() user: { id: string }) {
    return this.coursService.consulterCours(user.id);
  }
}
