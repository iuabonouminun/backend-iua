import {
  Body,
  Controller,
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
import { ManualAttendanceDto, UpdateAttendanceDto } from '../dto/admin.dto';
import { AdminAttendanceService } from './admin-attendance.service';

@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@Controller('admin/attendances')
export class AdminAttendanceController {
  constructor(private readonly service: AdminAttendanceService) {}

  @Get()
  list(
    @CurrentAdmin() admin: AdminContext,
    @Query('classId') classId?: string,
    @Query('studentId') studentId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list(admin.establishmentId, {
      classId,
      studentId,
      subjectId,
      status,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  detail(@CurrentAdmin() admin: AdminContext, @Param('id') id: string) {
    return this.service.getById(admin.establishmentId, id);
  }

  @Patch(':id')
  update(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body() dto: UpdateAttendanceDto,
  ) {
    return this.service.update(admin, id, dto);
  }

  @Post('manual')
  createManual(
    @CurrentAdmin() admin: AdminContext,
    @Body() dto: ManualAttendanceDto,
  ) {
    return this.service.createManual(admin, dto);
  }
}
