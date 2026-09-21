/**
 * Service d'authentification — login et génération du jeton JWT pour l'enseignant
 */
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
export interface EnseignantPayload {
  sub: string;
  email: string;
  externalUserId: string;
  establishmentId: string;
  role: 'enseignant';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Authentifie un enseignant et renvoie un jeton JWT
   * @param dto Identifiants de connexion (email + mot de passe)
   * @returns Objet contenant le jeton d'accès et les infos de l'enseignant
   */
  async login(dto: LoginDto): Promise<{ accessToken: string; enseignant: { id: string; firstName: string; lastName: string; email: string } }> {
    const enseignant = await this.prisma.teacher.findUnique({
      where: { email: dto.email },
    });

    if (!enseignant) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    if (enseignant.status !== 'active') {
      throw new UnauthorizedException('Votre compte est suspendu. Contactez l\'administration.');
    }

    if (!enseignant.passwordHash) {
      throw new UnauthorizedException('Aucun mot de passe défini pour ce compte. Contactez l\'administration.');
    }

    const motDePasseValide = await bcrypt.compare(dto.password, enseignant.passwordHash);
    if (!motDePasseValide) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    const payload: EnseignantPayload = {
      sub: enseignant.id,
      email: enseignant.email,
      externalUserId: enseignant.externalUserId,
      establishmentId: enseignant.establishmentId,
      role: 'enseignant',
    };

    const accessToken = this.jwtService.sign(payload);

    this.logger.log(`Enseignant connecté : ${enseignant.email}`);

    // Journal d'activité : trace la connexion pour que l'admin ait une vue
    // sur ce qui se passe côté enseignant, pas seulement côté admin.
    this.prisma.activityEvent
      .create({
        data: {
          establishmentId: enseignant.establishmentId,
          type: 'login_external',
          actorName: `${enseignant.firstName} ${enseignant.lastName}`,
          actorRole: 'teacher',
          targetLabel: 'Connexion enseignant',
        },
      })
      .catch((e) => this.logger.error(`Journalisation impossible : ${String(e)}`));

    return {
      accessToken,
      enseignant: {
        id: enseignant.id,
        firstName: enseignant.firstName,
        lastName: enseignant.lastName,
        email: enseignant.email,
      },
    };
  }

  /**
   * Récupère un enseignant par son identifiant
   * @param id Identifiant de l'enseignant
   */
  async getEnseignantById(id: string) {
    return this.prisma.teacher.findUnique({ where: { id } });
  }
}
