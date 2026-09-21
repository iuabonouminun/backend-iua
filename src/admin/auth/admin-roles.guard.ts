import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'OBSERVATEUR';

export const ADMIN_ROLES_KEY = 'adminRoles';

/** @Roles('SUPER_ADMIN') au-dessus d'une route pour la restreindre. */
export const Roles = (...roles: AdminRole[]) =>
  SetMetadata(ADMIN_ROLES_KEY, roles);

/**
 * Ce que le compte OBSERVATEUR a le droit de faire, et RIEN d'autre :
 * consulter le registre des présences, et générer/télécharger la fiche.
 * Tout le reste (étudiants, enseignants, emploi du temps, salles, fraude,
 * journal, comptes admin, paramètres…) lui est fermé — y compris en
 * lecture. C'est une liste blanche volontairement stricte : une route
 * oubliée ici est une route REFUSÉE, jamais autorisée par défaut.
 *
 * Comparée à un contrôle par @Roles() au cas par cas sur chaque route,
 * cette liste centralisée évite qu'un nouveau contrôleur, ajouté plus
 * tard sans y penser, ne s'ouvre accidentellement à l'observateur.
 */
const OBSERVATEUR_ALLOWLIST: { method: string; test: (path: string) => boolean }[] = [
  // Consultation du registre des présences (liste + détail d'un enregistrement).
  {
    method: 'GET',
    test: (p) => p === '/admin/attendances' || p.startsWith('/admin/attendances/'),
  },
  // Génération puis téléchargement de la fiche de présence.
  { method: 'POST', test: (p) => p === '/admin/reports/export' },
  {
    method: 'GET',
    test: (p) => p.startsWith('/admin/reports/') && p.endsWith('/download'),
  },
];

@Injectable()
export class AdminRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user as { role?: AdminRole } | undefined;
    if (!user) throw new ForbiddenException('Authentification requise');

    const requis = this.reflector.getAllAndOverride<AdminRole[]>(
      ADMIN_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requis?.length && !requis.includes(user.role as AdminRole)) {
      throw new ForbiddenException(
        "Votre profil administrateur n'autorise pas cette action",
      );
    }

    if (user.role === 'OBSERVATEUR') {
      const chemin = req.path.replace(/^\/api/, '');
      const autorise = OBSERVATEUR_ALLOWLIST.some(
        (regle) => regle.method === req.method && regle.test(chemin),
      );
      if (!autorise) {
        throw new ForbiddenException(
          "Profil observateur : seules la consultation et l'export des présences sont autorisés",
        );
      }
    }

    return true;
  }
}
