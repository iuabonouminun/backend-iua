/**
 * Supprime un compte administrateur.
 *
 *   ADMIN_EMAIL=admin@iuaci.org npx ts-node -r tsconfig-paths/register prisma/delete-admin.ts
 *
 * Si aucun ADMIN_EMAIL n'est fourni, cible par défaut le super admin de seed
 * (admin@iuaci.org).
 *
 * AdminUser est référencé par :
 *  - ReportRequest.requestedById (obligatoire) → ces rapports sont supprimés
 *  - FraudAlert.reviewedById (optionnel)       → remis à null
 *  - AttendanceRecord.correctedById (optionnel) → remis à null
 * Sans ce nettoyage préalable, la suppression échoue avec une erreur de
 * contrainte de clé étrangère (P2003).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@iuaci.org';

  const admin = await prisma.adminUser.findUnique({ where: { email } });

  if (!admin) {
    console.log(`Aucun compte administrateur trouvé pour ${email}.`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    const rapportsSupprimes = await tx.reportRequest.deleteMany({
      where: { requestedById: admin.id },
    });

    const alertesMaj = await tx.fraudAlert.updateMany({
      where: { reviewedById: admin.id },
      data: { reviewedById: null },
    });

    const correctionsMaj = await tx.attendanceRecord.updateMany({
      where: { correctedById: admin.id },
      data: { correctedById: null },
    });

    await tx.adminUser.delete({ where: { id: admin.id } });

    console.log('----------------------------------------------------');
    console.log(`Compte supprimé : ${admin.email} (${admin.role})`);
    console.log(`  Rapports supprimés         : ${rapportsSupprimes.count}`);
    console.log(`  Alertes fraude détachées   : ${alertesMaj.count}`);
    console.log(`  Présences corrigées détachées : ${correctionsMaj.count}`);
    console.log('----------------------------------------------------');
  });
}

main()
  .catch((e) => {
    console.error('Erreur lors de la suppression :', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
