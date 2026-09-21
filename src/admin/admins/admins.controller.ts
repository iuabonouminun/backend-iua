/**
 * Routes de gestion des comptes administrateurs : /api/admin/admins.
 *
 * Lecture (GET) : SUPER_ADMIN et ADMIN (transparence sur qui administre
 * l'établissement). Fermée à l'OBSERVATEUR par la liste blanche du guard.
 * Écriture (création, modification de rôle, suspension, reset mot de passe) :
 * ouverte au SUPER_ADMIN et à l'ADMIN au niveau de la route, mais
 * AdminsService applique ensuite la hiérarchie réelle : un ADMIN ne peut
 * créer et gérer que des comptes OBSERVATEUR, jamais un autre ADMIN ni un
 * SUPER_ADMIN. Voir AdminsService.verifierPeutGererRole.
 *
 * Aucune route DELETE : comme pour les autres comptes, on suspend, on ne
 * supprime jamais (le journal d'activité garde la trace des actions de
 * chaque administrateur, y compris ceux qui ne sont plus actifs).
 */
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminJwtAuthGuard } from '../auth/admin-jwt-auth.guard';
import { AdminRolesGuard, Roles } from '../auth/admin-roles.guard';
import { AdminContext, CurrentAdmin } from '../auth/current-admin.decorator';
import {
  CreateAdminDto,
  ResetPasswordDto,
  SuspendAccountDto,
  UpdateAdminDto,
} from '../dto/admin.dto';
import { AdminsService } from './admins.service';

@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@Controller('admin/admins')
export class AdminsController {
  constructor(private readonly service: AdminsService) {}

  @Get()
  list(@CurrentAdmin() admin: AdminContext) {
    return this.service.list(admin.establishmentId);
  }

  @Get(':id')
  get(@CurrentAdmin() admin: AdminContext, @Param('id') id: string) {
    return this.service.get(admin.establishmentId, id);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post()
  create(@CurrentAdmin() admin: AdminContext, @Body() dto: CreateAdminDto) {
    return this.service.create(admin, dto);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch(':id')
  update(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body() dto: UpdateAdminDto,
  ) {
    return this.service.update(admin, id, dto);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post(':id/suspend')
  suspend(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body() dto: SuspendAccountDto,
  ) {
    return this.service.setStatus(admin, id, true, dto.reason);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post(':id/reactivate')
  reactivate(@CurrentAdmin() admin: AdminContext, @Param('id') id: string) {
    return this.service.setStatus(admin, id, false);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post(':id/reset-password')
  resetPassword(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.service.resetPassword(admin, id, dto.newPassword);
  }
}
