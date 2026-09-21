/**
 * Module Administrateur.
 *
 * Regroupe tout l'espace admin sous /api/admin/* :
 *   auth · accès (étudiants, enseignants, chefs de classe) · référentiel
 *   académique · séances & QR · présences · anti-fraude · journal d'audit ·
 *   notifications · rapports · paramètres.
 *
 * À brancher dans AppModule : imports: [..., AdminModule]
 */
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';

import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthService } from './auth/admin-auth.service';
import { JwtAdminStrategy } from './auth/jwt-admin.strategy';
import { AdminRolesGuard } from './auth/admin-roles.guard';

import { ActivityService } from './common/activity.service';
import { AdminSettingsController } from './settings/admin-settings.controller';
import { AdminSettingsService } from './settings/admin-settings.service';

import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';

import { PeopleController } from './people/people.controller';
import { PeopleService } from './people/people.service';

import { AdminsController } from './admins/admins.controller';
import { AdminsService } from './admins/admins.service';

import { AcademicController } from './academic/academic.controller';
import { AcademicService } from './academic/academic.service';

import { AdminSessionsController } from './sessions/admin-sessions.controller';
import { AdminSessionsService } from './sessions/admin-sessions.service';

import { AdminAttendanceController } from './attendance/admin-attendance.controller';
import { AdminAttendanceService } from './attendance/admin-attendance.service';

import { FraudController } from './fraud/fraud.controller';
import { FraudService } from './fraud/fraud.service';
import { FraudScheduler } from './fraud/fraud.scheduler';

import { MonitoringController } from './monitoring/monitoring.controller';
import { MonitoringService } from './monitoring/monitoring.service';

import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';

@Module({
  imports: [
    PrismaModule,
    RealtimeModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // Secret distinct de celui des enseignants/étudiants : un jeton
        // d'un autre espace ne doit jamais ouvrir une route admin.
        secret: config.get<string>('JWT_ADMIN_SECRET', 'secret_jwt_admin_dev'),
        signOptions: { expiresIn: '2h' },
      }),
    }),
  ],
  controllers: [
    AdminAuthController,
    DashboardController,
    PeopleController,
    AdminsController,
    AcademicController,
    AdminSessionsController,
    AdminAttendanceController,
    FraudController,
    MonitoringController,
    ReportsController,
    AdminSettingsController,
  ],
  providers: [
    AdminAuthService,
    JwtAdminStrategy,
    AdminRolesGuard,
    ActivityService,
    AdminSettingsService,
    DashboardService,
    PeopleService,
    AdminsService,
    AcademicService,
    AdminSessionsService,
    AdminAttendanceService,
    FraudService,
    FraudScheduler,
    MonitoringService,
    ReportsService,
  ],
  exports: [ActivityService, FraudService],
})
export class AdminModule {}
