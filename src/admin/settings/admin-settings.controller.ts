import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../auth/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../auth/admin-roles.guard';
import { AdminContext, CurrentAdmin } from '../auth/current-admin.decorator';
import { UpdateSettingsDto } from '../dto/admin.dto';
import { AdminSettingsService } from './admin-settings.service';

@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly service: AdminSettingsService) {}

  @Get()
  get(@CurrentAdmin() admin: AdminContext) {
    return this.service.get(admin.establishmentId);
  }

  @Patch()
  update(@CurrentAdmin() admin: AdminContext, @Body() dto: UpdateSettingsDto) {
    return this.service.update(
      admin.establishmentId,
      dto,
      `${admin.firstName} ${admin.lastName}`,
    );
  }
}
