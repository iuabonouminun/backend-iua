/**
 * Module racine de l'application — assemble tous les modules fonctionnels
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EnseignantModule } from './enseignant/enseignant.module';
import { EtudiantAuthModule } from './etudiant-auth/etudiant-auth.module';
import { EtudiantModule } from './etudiant/etudiant.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SessionsModule } from './sessions/sessions.module';
import { LeaderModule } from './leader/leader.module';
import { AttendanceModule } from './attendance/attendance.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    EnseignantModule,
    EtudiantAuthModule,
    EtudiantModule,
    RealtimeModule,
    SessionsModule,
    LeaderModule,
    AttendanceModule,
    AdminModule,
  ],
})
export class AppModule {}
