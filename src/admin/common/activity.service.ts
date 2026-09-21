/**
 * Journal d'activité — piste d'audit.
 *
 * Chaque action sensible de l'admin (création de compte, suspension, reset de
 * mot de passe, correction de présence, revue d'alerte de fraude, export...)
 * passe par ici. C'est ce journal qui rend l'administrateur lui-même
 * redevable : sans trace, une correction de présence est indiscernable d'une
 * fraude interne.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ActivityType, ActorRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface LogEntry {
  establishmentId: string;
  type: ActivityType | keyof typeof ActivityType;
  actorName: string;
  actorRole: ActorRole | keyof typeof ActorRole;
  targetLabel: string;
}

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** N'échoue jamais l'action métier : un journal indisponible ne bloque pas. */
  async log(entry: LogEntry): Promise<void> {
    if (!entry.establishmentId) return;
    try {
      await this.prisma.activityEvent.create({
        data: {
          establishmentId: entry.establishmentId,
          type: entry.type as ActivityType,
          actorName: entry.actorName,
          actorRole: entry.actorRole as ActorRole,
          targetLabel: entry.targetLabel,
        },
      });
    } catch (error) {
      this.logger.error(`Journalisation impossible : ${String(error)}`);
    }
  }

  /** GET /api/admin/activity-logs */
  async list(
    establishmentId: string,
    filters: {
      type?: string;
      actorRole?: string;
      from?: string;
      to?: string;
      limit?: number;
    },
  ) {
    const where: any = { establishmentId };
    if (filters.type) where.type = filters.type;
    if (filters.actorRole) where.actorRole = filters.actorRole;
    if (filters.from || filters.to) {
      where.timestamp = {};
      if (filters.from) where.timestamp.gte = new Date(filters.from);
      if (filters.to) where.timestamp.lte = new Date(`${filters.to}T23:59:59`);
    }

    const events = await this.prisma.activityEvent.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: Math.min(Number(filters.limit) || 200, 500),
    });

    return events.map((e) => ({
      id: e.id,
      user: e.actorName,
      action: LIBELLES_ACTION[e.type] ?? e.type,
      entity: ENTITE_PAR_TYPE[e.type] ?? 'Système',
      entityId: e.id,
      details: e.targetLabel,
      timestamp: e.timestamp.toISOString(),
      result: RESULTAT_PAR_TYPE[e.type] ?? 'success',
    }));
  }
}

const LIBELLES_ACTION: Record<string, string> = {
  attendance_scan: 'Scan de présence',
  qr_generated: 'Génération QR',
  qr_regenerated: 'Régénération QR',
  session_closed: 'Clôture de séance',
  schedule_modified: "Modification d'emploi du temps",
  login_external: 'Connexion',
  settings_changed: 'Modification des paramètres',
  admin_login: 'Connexion administrateur',
  admin_login_failed: 'Échec de connexion',
  account_created: 'Création de compte',
  account_updated: 'Modification de compte',
  account_suspended: 'Suspension de compte',
  account_reactivated: 'Réactivation de compte',
  password_reset: 'Réinitialisation de mot de passe',
  leader_assigned: 'Désignation chef de classe',
  attendance_corrected: 'Correction de présence',
  fraud_alert_reviewed: "Traitement d'une alerte de fraude",
  report_exported: 'Export de rapport',
};

const ENTITE_PAR_TYPE: Record<string, string> = {
  attendance_scan: 'Présence',
  attendance_corrected: 'Présence',
  qr_generated: 'QR Code',
  qr_regenerated: 'QR Code',
  session_closed: 'Séance',
  schedule_modified: 'Emploi du temps',
  account_created: 'Compte',
  account_updated: 'Compte',
  account_suspended: 'Compte',
  account_reactivated: 'Compte',
  password_reset: 'Compte',
  leader_assigned: 'Classe',
  fraud_alert_reviewed: 'Alerte',
  report_exported: 'Rapport',
  settings_changed: 'Paramètres',
};

const RESULTAT_PAR_TYPE: Record<string, 'success' | 'warning' | 'error'> = {
  admin_login_failed: 'error',
  account_suspended: 'warning',
  fraud_alert_reviewed: 'warning',
  qr_regenerated: 'warning',
};
