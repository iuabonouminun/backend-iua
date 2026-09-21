import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { LeaderAttendanceController } from './leader-attendance.controller';
import { LeaderAttendanceService } from './leader-attendance.service';
import { SessionResolverService } from './session-resolver.service';

@Module({
  imports: [RealtimeModule],
  controllers: [SessionsController, LeaderAttendanceController],
  providers: [SessionsService, LeaderAttendanceService, SessionResolverService],
  exports: [SessionsService, SessionResolverService],
})
export class SessionsModule {}
