/**
 * Création du premier compte administrateur.
 *
 *   npx ts-node -r tsconfig-paths/register prisma/seed-admin.ts
 *
 * Variables lues (avec valeurs de repli pour le développement) :
 *   ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FIRSTNAME, ADMIN_LASTNAME,
 *   ESTABLISHMENT_NAME
 *
 * Le script est idempotent : relancé, il met seulement à jour le mot de passe.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@iuaci.org';
  const motDePasse = process.env.ADMIN_PASSWORD ?? 'ChangeMoiVite2026!';
  const prenom = process.env.ADMIN_FIRSTNAME ?? 'Administrateur';
  const nom = process.env.ADMIN_LASTNAME ?? 'Principal';
  const nomEtablissement =
    process.env.ESTABLISHMENT_NAME ?? "Institut Universitaire d'Abidjan";

  if (motDePasse.length < 10) {
    throw new Error('ADMIN_PASSWORD doit faire au moins 10 caractères');
  }

  let etablissement = await prisma.establishment.findFirst({
    where: { isCurrent: true },
  });

  if (!etablissement) {
    etablissement = await prisma.establishment.create({
      data: { name: nomEtablissement, isCurrent: true },
    });
    console.log(`Établissement créé : ${etablissement.name}`);
  }

  await prisma.establishmentSettings.upsert({
    where: { establishmentId: etablissement.id },
    create: { establishmentId: etablissement.id },
    update: {},
  });

  const hash = await bcrypt.hash(motDePasse, 12);

  const admin = await prisma.adminUser.upsert({
    where: { email },
    create: {
      email,
      firstName: prenom,
      lastName: nom,
      passwordHash: hash,
      role: 'SUPER_ADMIN',
      establishmentId: etablissement.id,
    },
    update: {
      passwordHash: hash,
      status: 'active',
      failedAttempts: 0,
      lockedUntil: null,
    },
  });

  console.log('----------------------------------------------------');
  console.log('Compte administrateur prêt');
  console.log(`  Email       : ${admin.email}`);
  console.log(`  Rôle        : ${admin.role}`);
  console.log(`  Établissement : ${etablissement.name}`);
  console.log('  Mot de passe : celui passé en variable (non affiché)');
  console.log('----------------------------------------------------');
  console.log('Changez ce mot de passe dès la première connexion.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
