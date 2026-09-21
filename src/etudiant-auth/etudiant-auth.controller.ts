import { Controller, Post, Body } from '@nestjs/common';
import { EtudiantAuthService } from './etudiant-auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('etudiant/auth')
export class EtudiantAuthController {
  constructor(private readonly etudiantAuthService: EtudiantAuthService) {}

  /**
   * POST /api/etudiant/auth/login
   * Connecte un étudiant et renvoie un jeton JWT.
   */
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.etudiantAuthService.login(dto);
  }
}
