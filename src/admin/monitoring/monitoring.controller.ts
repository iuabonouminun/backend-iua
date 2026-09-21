import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminJwtAuthGuard } from '../auth/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../auth/admin-roles.guard';
import { AdminContext, CurrentAdmin } from '../auth/current-admin.decorator';
import { ActivityService } from '../common/activity.service';
import { MonitoringService } from './monitoring.service';

@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@Controller('admin')
export class MonitoringController {
  constructor(
    private readonly service: MonitoringService,
    private readonly activity: ActivityService,
  ) {}

  /** GET /api/admin/activity-logs — journal d'audit */
  @Get('activity-logs')
  logs(
    @CurrentAdmin() admin: AdminContext,
    @Query('type') type?: string,
    @Query('actorRole') actorRole?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.activity.list(admin.establishmentId, {
      type,
      actorRole,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('notifications')
  notifications(@CurrentAdmin() admin: AdminContext) {
    return this.service.list(admin);
  }

  @Patch('notifications/:id')
  markRead(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body('read') read = true,
  ) {
    return this.service.markRead(admin, id, read);
  }

  @Post('notifications/read-all')
  markAllRead(@CurrentAdmin() admin: AdminContext) {
    return this.service.markAllRead(admin);
  }

  @Delete('notifications/:id')
  remove(@CurrentAdmin() admin: AdminContext, @Param('id') id: string) {
    return this.service.remove(admin, id);
  }
}
