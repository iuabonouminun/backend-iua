/**
 * Script de seed — insère des données de test dans la base
 * Exécuter avec : npm run seed
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Début du seed...');

  // Établissement
  const establishment = await prisma.establishment.upsert({
    where: { id: 'est-001' },
    update: {},
    create: {
      id: 'est-001',
      name: 'Université Numérique du Plateau',
      isCurrent: true,
    },
  });

  // Enseignants
  const motDePasseHash = await bcrypt.hash('password123', 10);
  const motDePasseSuperAdminHash = await bcrypt.hash('Theking14@', 10);
  
  const teacher1 = await prisma.teacher.upsert({
    where: { email: 'amadou.traore@univ-plateau.edu' },
    update: {},
    create: {
      id: 'teacher-001',
      firstName: 'Amadou',
      lastName: 'Traoré',
      email: 'amadou.traore@univ-plateau.edu',
      externalUserId: 'ext-teacher-001',
      passwordHash: motDePasseHash,
      status: 'active',
      establishmentId: establishment.id,
    },
  });

  const teacher2 = await prisma.teacher.upsert({
    where: { email: 'fatou.diallo@univ-plateau.edu' },
    update: {},
    create: {
      id: 'teacher-002',
      firstName: 'Fatou',
      lastName: 'Diallo',
      email: 'fatou.diallo@univ-plateau.edu',
      externalUserId: 'ext-teacher-002',
      passwordHash: motDePasseHash,
      status: 'active',
      establishmentId: establishment.id,
    },
  });

  // Matières
  const subj1 = await prisma.subject.upsert({
    where: { code: 'INFO301' },
    update: {},
    create: { id: 'subj-001', name: 'Algorithmique Avancée', code: 'INFO301', volumeHours: 60, establishmentId: establishment.id },
  });
  const subj2 = await prisma.subject.upsert({
    where: { code: 'INFO302' },
    update: {},
    create: { id: 'subj-002', name: 'Bases de Données', code: 'INFO302', volumeHours: 45, establishmentId: establishment.id },
  });
  const subj3 = await prisma.subject.upsert({
    where: { code: 'INFO303' },
    update: {},
    create: { id: 'subj-003', name: 'Réseaux et Protocoles', code: 'INFO303', volumeHours: 40, establishmentId: establishment.id },
  });
  const subj4 = await prisma.subject.upsert({
    where: { code: 'INFO401' },
    update: {},
    create: { id: 'subj-004', name: 'Intelligence Artificielle', code: 'INFO401', volumeHours: 50, establishmentId: establishment.id },
  });

  // Classes
  const class1 = await prisma.schoolClass.upsert({
    where: { id: 'class-001' },
    update: {},
    create: { id: 'class-001', name: 'L3 Informatique A', level: 'L3', program: 'Génie Informatique', studentCount: 3, establishmentId: establishment.id },
  });
  const class2 = await prisma.schoolClass.upsert({
    where: { id: 'class-002' },
    update: {},
    create: { id: 'class-002', name: 'L3 Informatique B', level: 'L3', program: 'Génie Informatique', studentCount: 2, establishmentId: establishment.id },
  });
  const class3 = await prisma.schoolClass.upsert({
    where: { id: 'class-003' },
    update: {},
    create: { id: 'class-003', name: 'M1 IA', level: 'M1', program: 'Intelligence Artificielle', studentCount: 2, establishmentId: establishment.id },
  });

  // Étudiants
  const students = [
    { id: 'student-001', matricule: '25INF01001', firstName: 'Moussa', lastName: 'Koné', email: 'moussa.kone@univ-plateau.edu', externalUserId: 'ext-student-001', classId: class1.id, establishmentId: establishment.id },
    { id: 'student-002', matricule: '25INF01002', firstName: 'Aïssatou', lastName: 'Bâ', email: 'aissatou.ba@univ-plateau.edu', externalUserId: 'ext-student-002', classId: class1.id, establishmentId: establishment.id },
    { id: 'student-003', matricule: '25INF01003', firstName: 'Ibrahim', lastName: 'Sow', email: 'ibrahim.sow@univ-plateau.edu', externalUserId: 'ext-student-003', classId: class1.id, establishmentId: establishment.id },
    { id: 'student-004', matricule: '25INF01004', firstName: 'Mariam', lastName: 'Cissé', email: 'mariam.cisse@univ-plateau.edu', externalUserId: 'ext-student-004', classId: class2.id, establishmentId: establishment.id },
    { id: 'student-005', matricule: '25INF01005', firstName: 'Ousmane', lastName: 'Diarra', email: 'ousmane.diarra@univ-plateau.edu', externalUserId: 'ext-student-005', classId: class2.id, establishmentId: establishment.id },
    { id: 'student-006', matricule: '25INF02001', firstName: 'Seydou', lastName: 'Keita', email: 'seydou.keita@univ-plateau.edu', externalUserId: 'ext-student-006', classId: class3.id, establishmentId: establishment.id },
    { id: 'student-007', matricule: '25INF02002', firstName: 'Aminata', lastName: 'Touré', email: 'aminata.toure@univ-plateau.edu', externalUserId: 'ext-student-007', classId: class3.id, establishmentId: establishment.id },
  ];

  for (const s of students) {
    await prisma.student.upsert({
      where: { id: s.id },
      update: {},
      create: { ...s, passwordHash: motDePasseHash },
    });
  }

  // Chef de classe : Moussa Koné (student-001) pilote L3 Informatique A.
  // C'est un champ sur la classe (leaderId), pas un compte à part — il se
  // connecte sur chef-app avec les MÊMES identifiants que student-app.
  await prisma.schoolClass.update({
    where: { id: class1.id },
    data: { leaderId: 'student-001' },
  });

  // Comptes administrateurs (aucun n'existait avant : sans eux, impossible
  // de se connecter sur admin-frontend). Un de chaque rôle, pour tester
  // les trois profils et les restrictions propres à chacun.
  await prisma.adminUser.upsert({
    where: { email: 'admin@iuaci.org' },
    update: {},
    create: {
      firstName: 'Awa',
      lastName: 'Sanogo',
      email: 'admin@iuaci.org',
      passwordHash: motDePasseSuperAdminHash,
      role: 'SUPER_ADMIN',
      status: 'active',
      establishmentId: establishment.id,
    },
  });

  await prisma.adminUser.upsert({
    where: { email: 'admin.gestion@iuaci.org' },
    update: {},
    create: {
      firstName: 'Karim',
      lastName: 'Ouattara',
      email: 'admin.gestion@iuaci.org',
      passwordHash: motDePasseHash,
      role: 'ADMIN',
      status: 'active',
      establishmentId: establishment.id,
    },
  });

  await prisma.adminUser.upsert({
    where: { email: 'observateur@iuaci.org' },
    update: {},
    create: {
      firstName: 'Salimata',
      lastName: 'Coulibaly',
      email: 'observateur@iuaci.org',
      passwordHash: motDePasseHash,
      role: 'OBSERVATEUR',
      status: 'active',
      establishmentId: establishment.id,
    },
  });

  // Liens enseignant-matière
  await prisma.teacherSubject.upsert({ where: { teacherId_subjectId: { teacherId: teacher1.id, subjectId: subj1.id } }, update: {}, create: { teacherId: teacher1.id, subjectId: subj1.id } });
  await prisma.teacherSubject.upsert({ where: { teacherId_subjectId: { teacherId: teacher1.id, subjectId: subj2.id } }, update: {}, create: { teacherId: teacher1.id, subjectId: subj2.id } });
  await prisma.teacherSubject.upsert({ where: { teacherId_subjectId: { teacherId: teacher1.id, subjectId: subj3.id } }, update: {}, create: { teacherId: teacher1.id, subjectId: subj3.id } });
  await prisma.teacherSubject.upsert({ where: { teacherId_subjectId: { teacherId: teacher2.id, subjectId: subj4.id } }, update: {}, create: { teacherId: teacher2.id, subjectId: subj4.id } });

  // Affectations
  const assignments = [
    { id: 'assign-001', teacherId: teacher1.id, subjectId: subj1.id, classId: class1.id },
    { id: 'assign-002', teacherId: teacher1.id, subjectId: subj1.id, classId: class2.id },
    { id: 'assign-003', teacherId: teacher1.id, subjectId: subj2.id, classId: class1.id },
    { id: 'assign-004', teacherId: teacher1.id, subjectId: subj3.id, classId: class3.id },
    { id: 'assign-005', teacherId: teacher2.id, subjectId: subj4.id, classId: class3.id },
  ];

  for (const a of assignments) {
    await prisma.assignment.upsert({
      where: { teacherId_subjectId_classId: { teacherId: a.teacherId, subjectId: a.subjectId, classId: a.classId } },
      update: {},
      create: a,
    });
  }

  // Salles (amphi CM + salles TD) — upsert par nom pour réutiliser les salles
  // déjà créées par la migration si elles existent (mêmes noms que les
  // anciens créneaux : A101, B203, A102, C305, C301), sinon les créer.
  const roomDefs = [
    { name: 'A101', type: 'TD' as const, capacity: 35 },
    { name: 'B203', type: 'TD' as const, capacity: 30 },
    { name: 'A102', type: 'TD' as const, capacity: 35 },
    { name: 'C305', type: 'TD' as const, capacity: 40 },
    { name: 'C301', type: 'CM' as const, capacity: 200 },
  ];
  const roomIdByName: Record<string, string> = {};
  for (const r of roomDefs) {
    const room = await prisma.room.upsert({
      where: { establishmentId_name: { establishmentId: establishment.id, name: r.name } },
      update: { type: r.type, capacity: r.capacity },
      create: { name: r.name, type: r.type, capacity: r.capacity, establishmentId: establishment.id },
    });
    roomIdByName[r.name] = room.id;
  }

  // Emploi du temps
  const schedules = [
    { id: 'sched-001', classId: class1.id, subjectId: subj1.id, teacherId: teacher1.id, roomId: roomIdByName['A101'], sessionType: 'TD' as const, dayOfWeek: 1, startTime: '08:00', endTime: '10:00' },
    { id: 'sched-002', classId: class1.id, subjectId: subj2.id, teacherId: teacher1.id, roomId: roomIdByName['B203'], sessionType: 'TD' as const, dayOfWeek: 2, startTime: '10:00', endTime: '12:00' },
    { id: 'sched-003', classId: class2.id, subjectId: subj1.id, teacherId: teacher1.id, roomId: roomIdByName['A102'], sessionType: 'TD' as const, dayOfWeek: 3, startTime: '14:00', endTime: '16:00' },
    { id: 'sched-004', classId: class3.id, subjectId: subj3.id, teacherId: teacher1.id, roomId: roomIdByName['C305'], sessionType: 'TD' as const, dayOfWeek: 4, startTime: '09:00', endTime: '11:00' },
    { id: 'sched-005', classId: class3.id, subjectId: subj4.id, teacherId: teacher2.id, roomId: roomIdByName['C301'], sessionType: 'CM' as const, dayOfWeek: 5, startTime: '08:00', endTime: '10:00' },
  ];

  for (const s of schedules) {
    await prisma.scheduleEntry.upsert({ where: { id: s.id }, update: {}, create: s });
  }

  // Paramètres établissement
  await prisma.establishmentSettings.upsert({
    where: { establishmentId: establishment.id },
    update: {},
    create: { establishmentId: establishment.id },
  });

  console.log('Seed terminé avec succès !');
  console.log('--- Comptes administrateurs ---');
  console.log('Super administrateur : admin@iuaci.org / theking14');
  console.log('Administrateur       : admin.gestion@iuaci.org / password123');
  console.log('Observateur          : observateur@iuaci.org / password123');
  console.log('--- Autres comptes ---');
  console.log('Enseignant de test : amadou.traore@univ-plateau.edu / password123');
  console.log('Étudiant de test : moussa.kone@univ-plateau.edu / password123');
  console.log('Chef de classe (mêmes identifiants) : moussa.kone@univ-plateau.edu / password123');
}

main()
  .catch((e) => {
    console.error('Erreur lors du seed :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
