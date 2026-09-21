import { Controller, Get, UseGuards } from '@nestjs/common';
import { EtudiantJwtAuthGuard } from '../../common/guards/etudiant-jwt-auth.guard';
import { EtudiantGuard } from '../../common/guards/etudiant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProfilService } from './profil.service';

@Controller('etudiant')
@UseGuards(EtudiantJwtAuthGuard, EtudiantGuard)
export class ProfilController {
  constructor(private readonly profilService: ProfilService) {}

  /**
   * GET /api/etudiant/profil
   * Équivalent de GET /api/student/me attendu par student-app.
   */
  @Get('profil')
  async consulterProfil(@CurrentUser() user: { id: string }) {
    return this.profilService.consulterProfil(user.id);
  }
}
