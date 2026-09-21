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
import { ReviewAlertDto, RunDetectionDto } from '../dto/admin.dto';
import { FraudService } from './fraud.service';

@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@Controller('admin/fraud')
export class FraudController {
  constructor(private readonly service: FraudService) {}

  /** GET /api/admin/fraud/alerts?status=OPEN&severity=HIGH */
  @Get('alerts')
  list(
    @CurrentAdmin() admin: AdminContext,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('type') type?: string,
    @Query('studentId') studentId?: string,
    @Query('sessionId') sessionId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list(admin.establishmentId, {
      status,
      severity,
      type,
      studentId,
      sessionId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /** GET /api/admin/fraud/stats */
  @Get('stats')
  stats(@CurrentAdmin() admin: AdminContext) {
    return this.service.stats(admin.establishmentId);
  }

  /** GET /api/admin/fraud/alerts/:id */
  @Get('alerts/:id')
  detail(@CurrentAdmin() admin: AdminContext, @Param('id') id: string) {
    return this.service.getById(admin.establishmentId, id);
  }

  /** POST /api/admin/fraud/run — relance la détection sur une période */
  @Post('run')
  run(@CurrentAdmin() admin: AdminContext, @Body() dto: RunDetectionDto) {
    return this.service.runDetection(admin.establishmentId, dto);
  }

  /** PATCH /api/admin/fraud/alerts/:id — confirmer / écarter / clôturer */
  @Patch('alerts/:id')
  review(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body() dto: ReviewAlertDto,
  ) {
    return this.service.review(admin, id, dto);
  }

  /** GET /api/admin/fraud/students/:id — dossier fraude d'un étudiant */
  @Get('students/:id')
  byStudent(@CurrentAdmin() admin: AdminContext, @Param('id') id: string) {
    return this.service.byStudent(admin.establishmentId, id);
  }
}
