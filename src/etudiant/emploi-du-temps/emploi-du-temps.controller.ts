import { Controller, Get, UseGuards } from '@nestjs/common';
import { EtudiantJwtAuthGuard } from '../../common/guards/etudiant-jwt-auth.guard';
import { EtudiantGuard } from '../../common/guards/etudiant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EmploiDuTempsService } from './emploi-du-temps.service';

@Controller('etudiant')
@UseGuards(EtudiantJwtAuthGuard, EtudiantGuard)
export class EmploiDuTempsController {
  constructor(private readonly emploiService: EmploiDuTempsService) {}

  /**
   * GET /api/etudiant/emploi-du-temps
   */
  @Get('emploi-du-temps')
  async consulterEmploiDuTemps(@CurrentUser() user: { id: string }) {
    return this.emploiService.consulterEmploiDuTemps(user.id);
  }
}
