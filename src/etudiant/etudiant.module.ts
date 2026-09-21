import { Module } from '@nestjs/common';
import { ProfilController } from './profil/profil.controller';
import { ProfilService } from './profil/profil.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { EmploiDuTempsController } from './emploi-du-temps/emploi-du-temps.controller';
import { EmploiDuTempsService } from './emploi-du-temps/emploi-du-temps.service';
import { CoursController } from './cours/cours.controller';
import { CoursService } from './cours/cours.service';
import { PresencesController } from './presences/presences.controller';
import { PresencesService } from './presences/presences.service';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';
import { EtudiantAuthModule } from '../etudiant-auth/etudiant-auth.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [EtudiantAuthModule, RealtimeModule],
  controllers: [
    ProfilController,
    DashboardController,
    EmploiDuTempsController,
    CoursController,
    PresencesController,
    NotificationsController,
  ],
  providers: [
    ProfilService,
    DashboardService,
    EmploiDuTempsService,
    CoursService,
    PresencesService,
    NotificationsService,
  ],
  exports: [PresencesService, EmploiDuTempsService, DashboardService],
})
export class EtudiantModule {}
