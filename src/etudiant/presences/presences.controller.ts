import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { EtudiantJwtAuthGuard } from '../../common/guards/etudiant-jwt-auth.guard';
import { EtudiantGuard } from '../../common/guards/etudiant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PresencesService } from './presences.service';
import { ScannerQrDto } from './dto/scanner-qr.dto';

@Controller('etudiant')
@UseGuards(EtudiantJwtAuthGuard, EtudiantGuard)
export class PresencesController {
  constructor(private readonly presencesService: PresencesService) {}

  /**
   * GET /api/etudiant/presences?date=&matiere=&statut=
   */
  @Get('presences')
  async getHistory(
    @CurrentUser() user: { id: string },
    @Query('date') date?: string,
    @Query('matiere') matiere?: string,
    @Query('statut') statut?: string,
  ) {
    return this.presencesService.getHistory(user.id, { date, matiere, statut });
  }

  /**
   * POST /api/etudiant/presences/scan
   * Reçoit uniquement le token lu depuis la caméra — jamais de validation
   * locale côté frontend.
   */
  @Post('presences/scan')
  async submitScan(
    @CurrentUser() user: { id: string },
    @Body() dto: ScannerQrDto,
  ) {
    return this.presencesService.submitScan(user.id, dto);
  }
}
