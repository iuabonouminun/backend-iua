import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProfilService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Récupère le profil de l'étudiant connecté, au format attendu par
   * student-app (ExistingPlatformUser) : NE PAS exposer de mot de passe,
   * l'étudiant ne peut rien modifier ici (lecture seule).
   */
  async consulterProfil(etudiantId: string) {
    const etudiant = await this.prisma.student.findUnique({
      where: { id: etudiantId },
      include: {
        class: { select: { id: true, name: true, level: true, program: true } },
        establishment: { select: { id: true, name: true } },
      },
    });

    if (!etudiant) {
      throw new NotFoundException('Étudiant introuvable');
    }

    return {
      externalUserId: etudiant.externalUserId,
      nom: etudiant.lastName,
      prenom: etudiant.firstName,
      email: etudiant.email,
      matricule: etudiant.matricule,
      classe: etudiant.class.name,
      filiere: etudiant.class.program,
      niveau: etudiant.class.level,
      etablissement: etudiant.establishment.name,
    };
  }
}
