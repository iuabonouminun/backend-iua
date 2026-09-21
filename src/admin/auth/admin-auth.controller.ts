import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtAuthGuard } from './admin-jwt-auth.guard';
import { AdminContext, CurrentAdmin } from './current-admin.decorator';
import { AdminLoginDto, ChangePasswordDto } from '../dto/admin.dto';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly service: AdminAuthService) {}

  /** POST /api/admin/auth/login */
  @Post('login')
  login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      undefined;
    return this.service.login(dto, ip);
  }

  /** GET /api/admin/auth/me — vérifie la validité du jeton au chargement du front */
  @UseGuards(AdminJwtAuthGuard)
  @Get('me')
  me(@CurrentAdmin() admin: AdminContext) {
    return admin;
  }

  /** POST /api/admin/auth/change-password */
  @UseGuards(AdminJwtAuthGuard)
  @Post('change-password')
  changePassword(
    @CurrentAdmin('id') adminId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.service.changePassword(adminId, dto);
  }
}
