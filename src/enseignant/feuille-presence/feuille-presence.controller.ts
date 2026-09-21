/**
 * Feuille de présence — routes enseignant.
 *
 * Les routes « /impression » renvoient du HTML, pas du JSON : elles s'ouvrent
 * dans un nouvel onglet et s'impriment directement. C'est le chemin le plus
 * court entre l'enseignant et sa feuille papier.
 */
import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { EnseignantGuard } from '../../common/guards/enseignant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FeuillePresenceService } from './feuille-presence.service';

@Controller('enseignant/feuille-presence')
@UseGuards(JwtAuthGuard, EnseignantGuard)
export class FeuillePresenceController {
  constructor(private readonly service: FeuillePresenceService) {}

  /* ------------------------ Feuille d'une séance ------------------------ */

  /** GET /api/enseignant/feuille-presence/seance/:id */
  @Get('seance/:id')
  async seance(
    @CurrentUser() user: { id: string },
    @Param('id') sessionId: string,
  ) {
    return this.service.feuilleSeance(user.id, sessionId);
  }

  /** GET /api/enseignant/feuille-presence/seance/:id/impression */
  @Get('seance/:id/impression')
  async impressionSeance(
    @CurrentUser() user: { id: string },
    @Param('id') sessionId: string,
    @Res() res: Response,
  ) {
    const html = await this.service.htmlSeance(user.id, sessionId);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  /** GET /api/enseignant/feuille-presence/seance/:id/csv */
  @Get('seance/:id/csv')
  async csvSeance(
    @CurrentUser() user: { id: string },
    @Param('id') sessionId: string,
    @Res() res: Response,
  ) {
    const csv = await this.service.csvSeance(user.id, sessionId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="presence-${sessionId}.csv"`,
    );
    res.send(csv);
  }

  /* -------------------- Récapitulatif classe / cours -------------------- */

  /**
   * GET /api/enseignant/feuille-presence/recapitulatif
   *   ?classId=...&subjectId=...&from=2026-09-01&to=2026-09-30
   */
  @Get('recapitulatif')
  async recapitulatif(
    @CurrentUser() user: { id: string },
    @Query('classId') classId: string,
    @Query('subjectId') subjectId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.recapitulatif(user.id, {
      classId,
      subjectId,
      from,
      to,
    });
  }

  /** GET /api/enseignant/feuille-presence/recapitulatif/impression?... */
  @Get('recapitulatif/impression')
  async impressionRecapitulatif(
    @CurrentUser() user: { id: string },
    @Query('classId') classId: string,
    @Res() res: Response,
    @Query('subjectId') subjectId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const html = await this.service.htmlRecapitulatif(user.id, {
      classId,
      subjectId,
      from,
      to,
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }
}
