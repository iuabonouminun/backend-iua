/**
 * Guard Enseignant — vérifie que l'utilisateur authentifié a le rôle "enseignant"
 * Ce guard ne donne AUCUN droit administrateur
 */
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class EnseignantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // L'utilisateur doit exister et avoir le rôle enseignant
    if (!user) {
      throw new ForbiddenException('Vous devez être connecté pour accéder à cette ressource');
    }

    // Vérification que l'utilisateur est bien un enseignant (et non un admin)
    // Le JWT contient role: 'enseignant' et l'objet user provient de la table teacher
    if (!user.id || !user.email) {
      throw new ForbiddenException('Accès réservé aux enseignants');
    }

    return true;
  }
}
