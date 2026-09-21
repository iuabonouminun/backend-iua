/**
 * Module Enseignant — regroupe tous les sous-modules de l'espace enseignant
 * Chaque sous-module est responsable d'une fonctionnalité métier
 */
import { Module } from '@nestjs/common';
import { ProfilController } from './profil/profil.controller';
import { ProfilService } from './profil/profil.service';
import { CoursController } from './cours/cours.controller';
import { CoursService } from './cours/cours.service';
import { EmploiDuTempsController } from './emploi-du-temps/emploi-du-temps.controller';
import { EmploiDuTempsService } from './emploi-du-temps/emploi-du-temps.service';
import { PresencesController } from './presences/presences.controller';
import { PresencesService } from './presences/presences.service';
import { HistoriqueController } from './historique/historique.controller';
import { HistoriqueService } from './historique/historique.service';
import { StatistiquesController } from './statistiques/statistiques.controller';
import { StatistiquesService } from './statistiques/statistiques.service';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';
import { FeuillePresenceController } from './feuille-presence/feuille-presence.controller';
import { FeuillePresenceService } from './feuille-presence/feuille-presence.service';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  // SessionsModule exporte SessionResolverService, utilisé par
  // PresencesService pour éviter les doublons de séance avec le chef de classe.
  imports: [SessionsModule],
  controllers: [
    ProfilController,
    CoursController,
    EmploiDuTempsController,
    PresencesController,
    HistoriqueController,
    StatistiquesController,
    NotificationsController,
    FeuillePresenceController,
  ],
  providers: [
    ProfilService,
    CoursService,
    EmploiDuTempsService,
    PresencesService,
    HistoriqueService,
    StatistiquesService,
    NotificationsService,
    FeuillePresenceService,
  ],
})
export class EnseignantModule {}
