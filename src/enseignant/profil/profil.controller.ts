/**
 * Contrôleur Profil — routes de consultation et modification du profil enseignant
 */
import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { EnseignantGuard } from '../../common/guards/enseignant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProfilService } from './profil.service';
import { ModifierProfilDto } from './dto/modifier-profil.dto';

@Controller('enseignant')
@UseGuards(JwtAuthGuard, EnseignantGuard)
export class ProfilController {
  constructor(private readonly profilService: ProfilService) {}

  /**
   * GET /api/enseignant/profil
   * Récupère le profil de l'enseignant connecté
   */
  @Get('profil')
  async consulterProfil(@CurrentUser() user: { id: string }) {
    return this.profilService.consulterProfil(user.id);
  }

  /**
   * PATCH /api/enseignant/profil
   * Modifie les informations autorisées du profil (prénom et nom uniquement)
   */
  @Patch('profil')
  async modifierProfil(
    @CurrentUser() user: { id: string },
    @Body() dto: ModifierProfilDto,
  ) {
    return this.profilService.modifierProfil(user.id, dto);
  }
}
