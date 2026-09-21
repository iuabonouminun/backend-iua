/**
 * Stratégie JWT dédiée à l'administrateur ("jwt-admin").
 * Un jeton enseignant ou étudiant ne peut donc JAMAIS ouvrir une route admin :
 * secret différent + vérification du rôle dans le payload.
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AdminAuthService, AdminPayload } from './admin-auth.service';

@Injectable()
export class JwtAdminStrategy extends PassportStrategy(Strategy, 'jwt-admin') {
  constructor(
    private readonly adminAuthService: AdminAuthService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ADMIN_SECRET', 'secret_jwt_admin_dev'),
    });
  }

  async validate(payload: AdminPayload) {
    if (payload?.role !== 'admin') {
      throw new UnauthorizedException('Jeton non administrateur');
    }

    const admin = await this.adminAuthService.getById(payload.sub);
    if (!admin) throw new UnauthorizedException('Administrateur introuvable');
    if (admin.status !== 'active') {
      throw new UnauthorizedException('Compte administrateur suspendu');
    }

    const { passwordHash, ...safe } = admin;
    return safe;
  }
}
