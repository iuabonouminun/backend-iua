import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminJwtAuthGuard } from '../auth/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../auth/admin-roles.guard';
import { AdminContext, CurrentAdmin } from '../auth/current-admin.decorator';
import { ReportsService } from './reports.service';

@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@Controller('admin/reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  /** GET /api/admin/reports/summary?from=&to=&classId=&facultyId= */
  @Get('summary')
  summary(
    @CurrentAdmin() admin: AdminContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('classId') classId?: string,
    @Query('facultyId') facultyId?: string,
  ) {
    return this.service.summary(admin.establishmentId, {
      from,
      to,
      classId,
      facultyId,
    });
  }

  @Get('history')
  history(@CurrentAdmin() admin: AdminContext) {
    return this.service.listRequests(admin.establishmentId);
  }

  /** POST /api/admin/reports/export */
  @Post('export')
  export(
    @CurrentAdmin() admin: AdminContext,
    @Body()
    body: {
      format: 'pdf' | 'docx' | 'xlsx' | 'csv';
      from?: string;
      to?: string;
      classId?: string;
      facultyId?: string;
    },
  ) {
    const { format, ...filters } = body;
    return this.service.export(admin, format ?? 'csv', filters);
  }

  /** GET /api/admin/reports/:id/download */
  @Get(':id/download')
  async download(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const fichier = await this.service.download(admin.establishmentId, id);
    res.setHeader('Content-Type', fichier.mime);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fichier.filename}"`,
    );
    res.send(fichier.content);
  }
}
