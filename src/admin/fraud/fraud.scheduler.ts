/**
 * Détection périodique.
 *
 * Optionnel : nécessite @nestjs/schedule (npm i @nestjs/schedule) et
 * ScheduleModule.forRoot() dans AppModule. Sans ce paquet, la détection reste
 * déclenchable à la main depuis /admin/fraude (bouton « Analyser »).
 * Pour l'activer, décommenter le décorateur @Cron et l'import.
 */
import { Injectable, Logger } from '@nestjs/common';
// import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { FraudService } from './fraud.service';

@Injectable()
export class FraudScheduler {
  private readonly logger = new Logger(FraudScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fraud: FraudService,
  ) {}

  // @Cron(CronExpression.EVERY_HOUR)
  async analyseHoraire(): Promise<void> {
    const etablissements = await this.prisma.establishment.findMany({
      select: { id: true, name: true },
    });

    for (const etab of etablissements) {
      try {
        const r = await this.fraud.runDetection(etab.id, {
          from: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        });
        if (r.nouvelles > 0) {
          this.logger.warn(`${etab.name} : ${r.nouvelles} nouvelle(s) alerte(s)`);
        }
      } catch (error) {
        this.logger.error(`Détection échouée pour ${etab.name} : ${String(error)}`);
      }
    }
  }
}
