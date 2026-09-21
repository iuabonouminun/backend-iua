import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Le chef de classe N'A PAS de compte séparé : c'est un étudiant normal
 * (déjà authentifié via EtudiantJwtAuthGuard + EtudiantGuard) qui se trouve
 * être `leaderId` ou `deputyLeaderId` de sa classe. Ce guard ajoute donc une
 * simple vérification de permission, jamais une authentification.
 */
@Injectable()
export class LeaderGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.id || !user?.classId) {
      throw new ForbiddenException('Accès réservé aux chefs de classe');
    }

    const classe = await this.prisma.schoolClass.findUnique({
      where: { id: user.classId },
      select: { leaderId: true, deputyLeaderId: true },
    });

    const estChef =
      classe && (classe.leaderId === user.id || classe.deputyLeaderId === user.id);

    if (!estChef) {
      throw new ForbiddenException(
        "Vous n'êtes pas chef ou chef adjoint de votre classe",
      );
    }

    return true;
  }
}
