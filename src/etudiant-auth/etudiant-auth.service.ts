/**
 * Service d'authentification — login et génération du jeton JWT pour l'étudiant.
 * Miroir de src/auth/auth.service.ts (enseignant), même logique bcrypt.
 */
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

export interface EtudiantPayload {
  sub: string;
  email: string;
  externalUserId: string;
  establishmentId: string;
  classId: string;
  role: 'etudiant';
}

@Injectable()
export class EtudiantAuthService {
  private readonly logger = new Logger(EtudiantAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Authentifie un étudiant et renvoie un jeton JWT.
   */
  async login(dto: LoginDto) {
    const etudiant = await this.prisma.student.findUnique({
      where: { email: dto.email },
    });

    if (!etudiant) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    if (etudiant.status !== 'active') {
      throw new UnauthorizedException(
        "Votre compte est suspendu. Contactez l'administration.",
      );
    }

    if (!etudiant.passwordHash) {
      throw new UnauthorizedException(
        "Aucun mot de passe défini pour ce compte. Contactez l'administration.",
      );
    }

    const motDePasseValide = await bcrypt.compare(
      dto.password,
      etudiant.passwordHash,
    );
    if (!motDePasseValide) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    const payload: EtudiantPayload = {
      sub: etudiant.id,
      email: etudiant.email,
      externalUserId: etudiant.externalUserId,
      establishmentId: etudiant.establishmentId,
      classId: etudiant.classId,
      role: 'etudiant',
    };

    const accessToken = this.jwtService.sign(payload);

    this.logger.log(`Étudiant connecté : ${etudiant.email}`);

    this.prisma.activityEvent
      .create({
        data: {
          establishmentId: etudiant.establishmentId,
          type: 'login_external',
          actorName: `${etudiant.firstName} ${etudiant.lastName}`,
          actorRole: 'student',
          targetLabel: 'Connexion étudiant',
        },
      })
      .catch((e) => this.logger.error(`Journalisation impossible : ${String(e)}`));

    return {
      accessToken,
      etudiant: {
        id: etudiant.id,
        firstName: etudiant.firstName,
        lastName: etudiant.lastName,
        email: etudiant.email,
      },
    };
  }

  async getEtudiantById(id: string) {
    return this.prisma.student.findUnique({ where: { id } });
  }
}
