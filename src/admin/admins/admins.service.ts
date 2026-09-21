/**
 * Gestion des comptes administrateurs eux-mêmes.
 *
 * C'était le trou du module admin : PeopleService gère étudiants, enseignants
 * et chefs de classe, mais personne ne pouvait créer ni même lister d'autres
 * administrateurs — la route n'existait tout simplement pas. C'est pourtant
 * le SUPER_ADMIN qui doit pouvoir ouvrir les accès de ses collègues admin.
 *
 * Mêmes garanties que pour les autres comptes :
 *  - jamais de suppression (on suspend, l'historique/le journal reste lisible) ;
 *  - un mot de passe généré n'est renvoyé qu'une seule fois ;
 *  - toute action est écrite au journal d'activité.
 *
 * Garde-fous spécifiques aux comptes admin :
 *  - un admin ne peut pas se suspendre ni se rétrograder lui-même
 *    (on éviterait sinon de se retrouver enfermé dehors) ;
 *  - on ne peut jamais suspendre ou rétrograder le dernier SUPER_ADMIN actif
 *    de l'établissement : il resterait alors sans personne capable
 *    d'administrer les accès.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../common/activity.service';
import { AdminContext } from '../auth/current-admin.decorator';
import { AdminRole } from '../auth/admin-roles.guard';
import { motDePasseTemporaire } from '../common/mappers';
import { CreateAdminDto, UpdateAdminDto } from '../dto/admin.dto';

@Injectable()
export class AdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async list(establishmentId: string) {
    const admins = await this.prisma.adminUser.findMany({
      where: { establishmentId },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return admins.map((a) => this.mapAdmin(a));
  }

  async get(establishmentId: string, id: string) {
    const admin = await this.prisma.adminUser.findFirst({
      where: { id, establishmentId },
    });
    if (!admin) throw new NotFoundException('Administrateur introuvable');
    return this.mapAdmin(admin);
  }

  async create(admin: AdminContext, dto: CreateAdminDto) {
    // Un ADMIN ne peut jamais créer que des comptes OBSERVATEUR — jamais un
    // ADMIN ni un SUPER_ADMIN, quoi que le corps de la requête contienne.
    const roleDemande: AdminRole = dto.role ?? (admin.role === 'SUPER_ADMIN' ? 'ADMIN' : 'OBSERVATEUR');
    this.verifierPeutGererRole(admin, roleDemande);

    const existant = await this.prisma.adminUser.findUnique({
      where: { email: dto.email },
    });
    if (existant) throw new ConflictException('Cet email est déjà utilisé');

    const motDePasse = dto.password ?? motDePasseTemporaire();

    const cree = await this.prisma.adminUser.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        role: roleDemande,
        passwordHash: await bcrypt.hash(motDePasse, 12),
        establishmentId: admin.establishmentId,
      },
    });

    await this.activity.log({
      establishmentId: admin.establishmentId,
      type: 'account_created',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: `Compte administrateur ${dto.firstName} ${dto.lastName} (${roleDemande})`,
    });

    return {
      success: true,
      message: 'Compte administrateur créé',
      id: cree.id,
      // Affiché une seule fois, à transmettre au nouvel administrateur.
      temporaryPassword: dto.password ? undefined : motDePasse,
    };
  }

  async update(admin: AdminContext, id: string, dto: UpdateAdminDto) {
    const existant = await this.prisma.adminUser.findFirst({
      where: { id, establishmentId: admin.establishmentId },
    });
    if (!existant) throw new NotFoundException('Administrateur introuvable');

    // Un ADMIN ne peut toucher qu'à des comptes déjà OBSERVATEUR, et ne
    // peut jamais les faire sortir de ce rôle.
    this.verifierPeutGererRole(admin, existant.role as AdminRole);
    if (dto.role) this.verifierPeutGererRole(admin, dto.role);

    if (dto.role && dto.role !== 'SUPER_ADMIN' && existant.role === 'SUPER_ADMIN') {
      await this.interdireSiDernierSuperAdmin(admin.establishmentId, id);
    }
    if (dto.role && existant.id === admin.id && dto.role !== admin.role) {
      throw new ForbiddenException(
        'Vous ne pouvez pas modifier votre propre rôle',
      );
    }

    await this.prisma.adminUser.update({ where: { id }, data: { ...dto } });

    await this.activity.log({
      establishmentId: admin.establishmentId,
      type: 'account_updated',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: `Administrateur ${existant.firstName} ${existant.lastName} — champs : ${Object.keys(dto).join(', ')}`,
    });

    return { success: true, message: 'Administrateur mis à jour' };
  }

  async setStatus(admin: AdminContext, id: string, suspendre: boolean, reason?: string) {
    const cible = await this.prisma.adminUser.findFirst({
      where: { id, establishmentId: admin.establishmentId },
    });
    if (!cible) throw new NotFoundException('Administrateur introuvable');
    this.verifierPeutGererRole(admin, cible.role as AdminRole);

    if (suspendre) {
      if (cible.id === admin.id) {
        throw new ForbiddenException('Vous ne pouvez pas suspendre votre propre compte');
      }
      if (cible.role === 'SUPER_ADMIN') {
        await this.interdireSiDernierSuperAdmin(admin.establishmentId, id);
      }
    }

    await this.prisma.adminUser.update({
      where: { id },
      data: { status: suspendre ? 'suspended' : 'active' },
    });

    await this.activity.log({
      establishmentId: admin.establishmentId,
      type: suspendre ? 'account_suspended' : 'account_reactivated',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: `Administrateur ${cible.firstName} ${cible.lastName}${reason ? ` — motif : ${reason}` : ''}`,
    });

    return {
      success: true,
      message: suspendre ? 'Compte administrateur suspendu' : 'Compte réactivé',
    };
  }

  async resetPassword(admin: AdminContext, id: string, newPassword?: string) {
    const cible = await this.prisma.adminUser.findFirst({
      where: { id, establishmentId: admin.establishmentId },
    });
    if (!cible) throw new NotFoundException('Administrateur introuvable');
    this.verifierPeutGererRole(admin, cible.role as AdminRole);

    const motDePasse = newPassword ?? motDePasseTemporaire();
    await this.prisma.adminUser.update({
      where: { id },
      data: {
        passwordHash: await bcrypt.hash(motDePasse, 12),
        failedAttempts: 0,
        lockedUntil: null,
      },
    });

    await this.activity.log({
      establishmentId: admin.establishmentId,
      type: 'password_reset',
      actorName: `${admin.firstName} ${admin.lastName}`,
      actorRole: 'admin',
      targetLabel: `Mot de passe réinitialisé — administrateur ${cible.firstName} ${cible.lastName}`,
    });

    return {
      success: true,
      message: 'Mot de passe réinitialisé',
      temporaryPassword: newPassword ? undefined : motDePasse,
    };
  }

  /* ================================ Privé ================================== */

  /**
   * Cœur de la hiérarchie : un SUPER_ADMIN gère tout le monde (y compris
   * d'autres SUPER_ADMIN). Un ADMIN ne gère QUE des comptes OBSERVATEUR —
   * ni un autre ADMIN, ni un SUPER_ADMIN, ni ne peut élever quiconque à
   * l'un de ces deux rôles. Un OBSERVATEUR n'atteint jamais ce service
   * (bloqué en amont par la liste blanche du guard).
   */
  private verifierPeutGererRole(admin: AdminContext, roleConcerne: AdminRole) {
    if (admin.role === 'SUPER_ADMIN') return;
    if (admin.role === 'ADMIN' && roleConcerne === 'OBSERVATEUR') return;

    throw new ForbiddenException(
      admin.role === 'ADMIN'
        ? 'Un administrateur ne peut créer et gérer que des comptes observateur'
        : "Votre profil n'autorise pas la gestion des comptes administrateurs",
    );
  }

  private async interdireSiDernierSuperAdmin(establishmentId: string, id: string) {
    const autresSuperAdminsActifs = await this.prisma.adminUser.count({
      where: {
        establishmentId,
        role: 'SUPER_ADMIN',
        status: 'active',
        id: { not: id },
      },
    });
    if (autresSuperAdminsActifs === 0) {
      throw new BadRequestException(
        "Impossible : ce serait le dernier SUPER_ADMIN actif de l'établissement",
      );
    }
  }

  private mapAdmin(a: any) {
    return {
      id: a.id,
      firstName: a.firstName,
      lastName: a.lastName,
      email: a.email,
      role: a.role,
      status: a.status === 'suspended' ? 'suspended' : 'active',
      lastLoginAt: a.lastLoginAt ? a.lastLoginAt.toISOString() : null,
      createdAt: a.createdAt.toISOString(),
    };
  }
}
