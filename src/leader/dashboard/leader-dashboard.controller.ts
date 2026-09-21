import { Controller, Get, UseGuards } from '@nestjs/common';
import { EtudiantJwtAuthGuard } from '../../common/guards/etudiant-jwt-auth.guard';
import { EtudiantGuard } from '../../common/guards/etudiant.guard';
import { LeaderGuard } from '../../common/guards/leader.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DashboardService } from '../../etudiant/dashboard/dashboard.service';

@Controller('leader')
@UseGuards(EtudiantJwtAuthGuard, EtudiantGuard, LeaderGuard)
export class LeaderDashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /api/leader/dashboard
   * Même agrégation que le dashboard étudiant : le chef EST un étudiant.
   */
  @Get('dashboard')
  async consulterDashboard(@CurrentUser() user: { id: string }) {
    return this.dashboardService.consulterDashboard(user.id);
  }
}
