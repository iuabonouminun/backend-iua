-- 1) Nouveau type + table des salles
CREATE TYPE "RoomType" AS ENUM ('CM', 'TD');

CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "RoomType" NOT NULL,
    "capacity" INTEGER NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Room_establishmentId_name_key" ON "Room"("establishmentId", "name");
CREATE INDEX "Room_establishmentId_idx" ON "Room"("establishmentId");

ALTER TABLE "Room" ADD CONSTRAINT "Room_establishmentId_fkey"
  FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2) Une salle "TD, 30 places" créée pour chaque nom de salle déjà utilisé
--    dans l'emploi du temps existant (à corriger ensuite dans l'onglet Salles
--    si certaines sont en réalité des amphis CM).
INSERT INTO "Room" ("id", "name", "type", "capacity", "establishmentId", "createdAt")
SELECT DISTINCT ON (c."establishmentId", se."room")
  'room_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20),
  se."room",
  'TD'::"RoomType",
  30,
  c."establishmentId",
  CURRENT_TIMESTAMP
FROM "ScheduleEntry" se
JOIN "SchoolClass" c ON c."id" = se."classId";

-- 3) Nouvelles colonnes sur ScheduleEntry
ALTER TABLE "ScheduleEntry" ADD COLUMN "sessionType" "RoomType" NOT NULL DEFAULT 'TD';
ALTER TABLE "ScheduleEntry" ADD COLUMN "roomId" TEXT;

-- 4) Relie chaque créneau existant à la salle qui correspond à son nom
UPDATE "ScheduleEntry" se
SET "roomId" = r."id"
FROM "Room" r, "SchoolClass" c
WHERE se."classId" = c."id"
  AND r."establishmentId" = c."establishmentId"
  AND r."name" = se."room";

-- 5) Maintenant que tout créneau a une salle, on rend la colonne obligatoire
ALTER TABLE "ScheduleEntry" ALTER COLUMN "roomId" SET NOT NULL;

-- 6) On supprime l'ancien champ texte libre et son index
DROP INDEX IF EXISTS "ScheduleEntry_room_dayOfWeek_idx";
ALTER TABLE "ScheduleEntry" DROP COLUMN "room";

-- 7) Nouvel index + clé étrangère
CREATE INDEX "ScheduleEntry_roomId_dayOfWeek_idx" ON "ScheduleEntry"("roomId", "dayOfWeek");
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;