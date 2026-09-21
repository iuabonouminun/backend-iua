import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { EtudiantAuthService, EtudiantPayload } from './etudiant-auth.service';

@Injectable()
export class JwtEtudiantStrategy extends PassportStrategy(
  Strategy,
  'jwt-etudiant',
) {
  constructor(
    private readonly etudiantAuthService: EtudiantAuthService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>(
        'JWT_SECRET_ETUDIANT',
        'secret_jwt_etudiant_dev',
      ),
    });
  }

  async validate(payload: EtudiantPayload) {
    const etudiant = await this.etudiantAuthService.getEtudiantById(
      payload.sub,
    );
    if (!etudiant) {
      throw new UnauthorizedException('Étudiant introuvable');
    }
    if (etudiant.status !== 'active') {
      throw new UnauthorizedException('Votre compte est suspendu');
    }
    return etudiant;
  }
}
