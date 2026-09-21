/**
 * Service Profil — gère la consultation et modification du profil enseignant
 * L'enseignant peut uniquement modifier son prénom et son nom
 * Il ne peut PAS modifier son email, son rôle, son statut ou son établissement
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ModifierProfilDto } from './dto/modifier-profil.dto';

@Injectable()
export class ProfilService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Récupère le profil de l'enseignant connecté
   * @param enseignantId Identifiant de l'enseignant
   */
  async consulterProfil(enseignantId: string) {
    const enseignant = await this.prisma.teacher.findUnique({
      where: { id: enseignantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        externalUserId: true,
        status: true,
        createdAt: true,
        establishment: {
          select: { id: true, name: true },
        },
        subjectLinks: {
          include: {
            subject: {
              select: { id: true, name: true, code: true, volumeHours: true },
            },
          },
        },
      },
    });

    if (!enseignant) {
      throw new NotFoundException('Enseignant introuvable');
    }

    return {
      ...enseignant,
      matieres: enseignant.subjectLinks.map((link) => link.subject),
      subjectLinks: undefined,
    };
  }

  /**
   * Modifie les informations autorisées du profil enseignant
   * @param enseignantId Identifiant de l'enseignant
   * @param dto Données à modifier (prénom et/ou nom uniquement)
   */
  async modifierProfil(enseignantId: string, dto: ModifierProfilDto) {
    const enseignant = await this.prisma.teacher.findUnique({
      where: { id: enseignantId },
    });

    if (!enseignant) {
      throw new NotFoundException('Enseignant introuvable');
    }

    // On ne met à jour que les champs autorisés (firstName, lastName)
    // L'email, le statut, l'établissement et l'externalUserId ne sont JAMAIS modifiables
    const donnees: { firstName?: string; lastName?: string } = {};
    if (dto.firstName !== undefined) donnees.firstName = dto.firstName;
    if (dto.lastName !== undefined) donnees.lastName = dto.lastName;

    const enseignantModifie = await this.prisma.teacher.update({
      where: { id: enseignantId },
      data: donnees,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
      },
    });

    return enseignantModifie;
  }
}
