/**
 * Authentification de l'administrateur.
 *
 * Volontairement séparée de l'auth enseignant/étudiant :
 *  - secret JWT distinct (JWT_ADMIN_SECRET)
 *  - durée de vie courte (2h)
 *  - verrouillage du compte après 5 échecs (anti bruteforce)
 *  - toute tentative, réussie ou non, est écrite dans le journal d'activité
 */
import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../common/activity.service';
import { AdminLoginDto, ChangePasswordDto } from '../dto/admin.dto';

const MAX_TENTATIVES = 5;
const DUREE_VERROU_MINUTES = 15;

export interface AdminPayload {
  sub: string;
  email: string;
  establishmentId: string;
  role: 'admin';
  adminRole: 'SUPER_ADMIN' | 'ADMIN' | 'OBSERVATEUR';
}

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly activity: ActivityService,
  ) {}

  async login(dto: AdminLoginDto, ip?: string) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { email: dto.email },
      include: { establishment: { select: { id: true, name: true } } },
    });

    // Message unique quel que soit le cas : on ne révèle jamais si l'email existe.
    const echec = () =>
      new UnauthorizedException('Email ou mot de passe incorrect');

    if (!admin || !admin.passwordHash) {
      await this.activity.log({
        establishmentId: admin?.establishmentId ?? (await this.etablissementParDefaut()),
        type: 'admin_login_failed',
        actorName: dto.email,
        actorRole: 'admin',
        targetLabel: `Tentative de connexion échouée (${ip ?? 'ip inconnue'})`,
      });
      throw echec();
    }

    if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.ceil(
        (admin.lockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new ForbiddenException(
        `Compte temporairement verrouillé. Réessayez dans ${minutes} minute(s).`,
      );
    }

    if (admin.status !== 'active') {
      throw new ForbiddenException('Ce compte administrateur est suspendu.');
    }

    const valide = await bcrypt.compare(dto.password, admin.passwordHash);

    if (!valide) {
      const tentatives = admin.failedAttempts + 1;
      await this.prisma.adminUser.update({
        where: { id: admin.id },
        data: {
          failedAttempts: tentatives,
          lockedUntil:
            tentatives >= MAX_TENTATIVES
              ? new Date(Date.now() + DUREE_VERROU_MINUTES * 60 * 1000)
              : null,
        },
      });
      await this.activity.log({
        establishmentId: admin.establishmentId,
        type: 'admin_login_failed',
        actorName: admin.email,
        actorRole: 'admin',
        targetLabel: `Mot de passe incorrect (${tentatives}/${MAX_TENTATIVES}) — ${ip ?? 'ip inconnue'}`,
      });
      throw echec();
    }

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    await this.activity.log({
      establishmentId: admin.establishmentId,
      type: 'admin_login',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: `Connexion réussie depuis ${ip ?? 'ip inconnue'}`,
    });

    const payload: AdminPayload = {
      sub: admin.id,
      email: admin.email,
      establishmentId: admin.establishmentId,
      role: 'admin',
      adminRole: admin.role,
    };

    return {
      accessToken: this.jwt.sign(payload),
      admin: {
        id: admin.id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
        role: admin.role,
        establishment: admin.establishment,
        lastLoginAt: admin.lastLoginAt,
      },
    };
  }

  async changePassword(adminId: string, dto: ChangePasswordDto) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
    });
    if (!admin?.passwordHash) throw new UnauthorizedException();

    const ok = await bcrypt.compare(dto.currentPassword, admin.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Mot de passe actuel incorrect');
    }

    await this.prisma.adminUser.update({
      where: { id: adminId },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 12) },
    });

    await this.activity.log({
      establishmentId: admin.establishmentId,
      type: 'password_reset',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: 'Changement de son propre mot de passe',
    });

    return { success: true, message: 'Mot de passe modifié' };
  }

  async getById(id: string) {
    return this.prisma.adminUser.findUnique({
      where: { id },
      include: { establishment: { select: { id: true, name: true } } },
    });
  }

  private async etablissementParDefaut(): Promise<string> {
    const etab = await this.prisma.establishment.findFirst({
      where: { isCurrent: true },
    });
    return etab?.id ?? '';
  }
}
