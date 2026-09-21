import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminJwtAuthGuard } from '../auth/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../auth/admin-roles.guard';
import { AdminContext, CurrentAdmin } from '../auth/current-admin.decorator';
import { AdminSessionsService } from './admin-sessions.service';

@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@Controller('admin')
export class AdminSessionsController {
  constructor(private readonly service: AdminSessionsService) {}

  /** GET /api/admin/sessions?status=active */
  @Get('sessions')
  list(
    @CurrentAdmin() admin: AdminContext,
    @Query('status') status?: string,
    @Query('classId') classId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('date') date?: string,
  ) {
    return this.service.list(admin.establishmentId, {
      status,
      classId,
      teacherId,
      date,
    });
  }

  /** GET /api/admin/qr-codes — suivi temps réel des QR du jour */
  @Get('qr-codes')
  qrMonitor(@CurrentAdmin() admin: AdminContext) {
    return this.service.qrMonitor(admin.establishmentId);
  }

  @Get('sessions/:id')
  detail(@CurrentAdmin() admin: AdminContext, @Param('id') id: string) {
    return this.service.getById(admin.establishmentId, id);
  }

  @Post('sessions/:id/relaunch')
  relaunch(@CurrentAdmin() admin: AdminContext, @Param('id') id: string) {
    return this.service.relaunch(admin, id);
  }

  @Post('sessions/:id/close')
  close(@CurrentAdmin() admin: AdminContext, @Param('id') id: string) {
    return this.service.close(admin, id);
  }
}
