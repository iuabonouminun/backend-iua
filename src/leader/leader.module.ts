import { Module } from '@nestjs/common';
import { LeaderDashboardController } from './dashboard/leader-dashboard.controller';
import { LeaderScheduleController } from './schedule/leader-schedule.controller';
import { LeaderSessionsController } from './sessions/leader-sessions.controller';
import { EtudiantModule } from '../etudiant/etudiant.module';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [EtudiantModule, SessionsModule],
  controllers: [
    LeaderDashboardController,
    LeaderScheduleController,
    LeaderSessionsController,
  ],
})
export class LeaderModule {}
