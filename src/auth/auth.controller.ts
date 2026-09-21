/**
 * Contrôleur d'authentification — route de connexion enseignant
 */
import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('enseignant/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/enseignant/auth/login
   * Connecte un enseignant et renvoie un jeton JWT
   */
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
