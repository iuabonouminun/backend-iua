import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

@Injectable()
export class EtudiantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException(
        'Vous devez être connecté pour accéder à cette ressource',
      );
    }

    if (!user.id || !user.matricule) {
      throw new ForbiddenException('Accès réservé aux étudiants');
    }

    return true;
  }
}
