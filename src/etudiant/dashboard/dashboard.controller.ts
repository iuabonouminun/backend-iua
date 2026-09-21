import { Controller, Get, UseGuards } from '@nestjs/common';
import { EtudiantJwtAuthGuard } from '../../common/guards/etudiant-jwt-auth.guard';
import { EtudiantGuard } from '../../common/guards/etudiant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';

@Controller('etudiant')
@UseGuards(EtudiantJwtAuthGuard, EtudiantGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /api/etudiant/dashboard
   */
  @Get('dashboard')
  async consulterDashboard(@CurrentUser() user: { id: string }) {
    return this.dashboardService.consulterDashboard(user.id);
  }
}
