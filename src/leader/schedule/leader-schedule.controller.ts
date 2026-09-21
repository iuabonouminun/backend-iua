import { Controller, Get, UseGuards } from '@nestjs/common';
import { EtudiantJwtAuthGuard } from '../../common/guards/etudiant-jwt-auth.guard';
import { EtudiantGuard } from '../../common/guards/etudiant.guard';
import { LeaderGuard } from '../../common/guards/leader.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EmploiDuTempsService } from '../../etudiant/emploi-du-temps/emploi-du-temps.service';

@Controller('leader')
@UseGuards(EtudiantJwtAuthGuard, EtudiantGuard, LeaderGuard)
export class LeaderScheduleController {
  constructor(private readonly emploiService: EmploiDuTempsService) {}

  /** GET /api/leader/schedule */
  @Get('schedule')
  async consulterEmploiDuTemps(@CurrentUser() user: { id: string }) {
    return this.emploiService.consulterEmploiDuTemps(user.id);
  }
}
