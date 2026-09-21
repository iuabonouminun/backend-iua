import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { EtudiantModule } from '../etudiant/etudiant.module';

@Module({
  imports: [EtudiantModule],
  controllers: [AttendanceController],
})
export class AttendanceModule {}
