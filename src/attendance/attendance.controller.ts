import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { EtudiantJwtAuthGuard } from '../common/guards/etudiant-jwt-auth.guard';
import { EtudiantGuard } from '../common/guards/etudiant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PresencesService } from '../etudiant/presences/presences.service';
import { ScannerQrDto } from '../etudiant/presences/dto/scanner-qr.dto';

/**
 * POST /api/attendance/scan — route générique demandée par le cahier des
 * charges de chef-app (le chef de classe scanne "comme un étudiant").
 * Aucune logique dupliquée : délègue entièrement à PresencesService, la
 * même utilisée par GET/POST /api/etudiant/presences.
 */
@Controller('attendance')
@UseGuards(EtudiantJwtAuthGuard, EtudiantGuard)
export class AttendanceController {
  constructor(private readonly presencesService: PresencesService) {}

  @Post('scan')
  async scan(@CurrentUser() user: { id: string }, @Body() dto: ScannerQrDto) {
    return this.presencesService.submitScan(user.id, dto);
  }
}
