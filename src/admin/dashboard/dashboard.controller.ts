import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../auth/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../auth/admin-roles.guard';
import { AdminContext, CurrentAdmin } from '../auth/current-admin.decorator';
import { DashboardService } from './dashboard.service';

@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  /** GET /api/admin/dashboard/stats */
  @Get('stats')
  stats(@CurrentAdmin() admin: AdminContext) {
    return this.service.stats(admin.establishmentId);
  }
}
