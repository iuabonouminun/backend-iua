/**
 * Stratégie JWT — extrait et valide le jeton depuis l'en-tête Authorization
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt } from 'passport-jwt';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService, EnseignantPayload } from './auth.service';

export interface JwtEnseignantPayload extends EnseignantPayload {}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly authService: AuthService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'secret_jwt_enseignant_dev'),
    });
  }

  /**
   * Valide le payload du JWT et renvoie l'enseignant
   * @param payload Données extraites du jeton
   */
  async validate(payload: JwtEnseignantPayload) {
    const enseignant = await this.authService.getEnseignantById(payload.sub);
    if (!enseignant) {
      throw new UnauthorizedException('Enseignant introuvable');
    }
    if (enseignant.status !== 'active') {
      throw new UnauthorizedException('Votre compte est suspendu');
    }
    // On ne renvoie jamais le hash du mot de passe
    const { passwordHash, ...result } = enseignant;
    return result;
  }
}
