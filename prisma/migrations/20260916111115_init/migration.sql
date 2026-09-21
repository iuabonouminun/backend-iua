/*
  Warnings:

  - Added the required column `updatedAt` to the `AttendanceRecord` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'OBSERVATEUR');

-- CreateEnum
CREATE TYPE "AttendanceMethod" AS ENUM ('qr', 'manual', 'import_csv');

-- CreateEnum
CREATE TYPE "FraudType" AS ENUM ('SCAN_HORS_CRENEAU', 'APPAREIL_PARTAGE', 'COMPTE_MULTI_APPAREILS', 'SCAN_HORS_SITE', 'PRESENCE_SIMULTANEE', 'SCAN_ECLAIR', 'QR_REGENERATIONS_EXCESSIVES', 'PRESENCE_MANUELLE_ABUSIVE', 'COMPTE_SUSPENDU_ACTIF', 'IP_PARTAGEE');

-- CreateEnum
CREATE TYPE "FraudSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FraudStatus" AS ENUM ('OPEN', 'CONFIRMED', 'DISMISSED', 'RESOLVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'admin_login';
ALTER TYPE "ActivityType" ADD VALUE 'admin_login_failed';
ALTER TYPE "ActivityType" ADD VALUE 'account_created';
ALTER TYPE "ActivityType" ADD VALUE 'account_updated';
ALTER TYPE "ActivityType" ADD VALUE 'account_suspended';
ALTER TYPE "ActivityType" ADD VALUE 'account_reactivated';
ALTER TYPE "ActivityType" ADD VALUE 'password_reset';
ALTER TYPE "ActivityType" ADD VALUE 'leader_assigned';
ALTER TYPE "ActivityType" ADD VALUE 'attendance_corrected';
ALTER TYPE "ActivityType" ADD VALUE 'fraud_alert_reviewed';
ALTER TYPE "ActivityType" ADD VALUE 'report_exported';

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "failedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN     "accuracyMeters" INTEGER,
ADD COLUMN     "correctedAt" TIMESTAMP(3),
ADD COLUMN     "correctedById" TEXT,
ADD COLUMN     "correctionNote" TEXT,
ADD COLUMN     "deviceFingerprint" TEXT,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "method" "AttendanceMethod" NOT NULL DEFAULT 'qr',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "EstablishmentSettings" ADD COLUMN     "academicYear" TEXT NOT NULL DEFAULT '2025-2026',
ADD COLUMN     "allowManualAttendance" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "attendanceAlertThreshold" INTEGER NOT NULL DEFAULT 70,
ADD COLUMN     "autoCloseSessions" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "burstScanThreshold" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "burstScanWindowSeconds" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "campusLatitude" DOUBLE PRECISION,
ADD COLUMN     "campusLongitude" DOUBLE PRECISION,
ADD COLUMN     "campusRadiusMeters" INTEGER NOT NULL DEFAULT 500,
ADD COLUMN     "currentSemester" TEXT NOT NULL DEFAULT 'S1',
ADD COLUMN     "defaultExportFormat" TEXT NOT NULL DEFAULT 'pdf',
ADD COLUMN     "fraudDetectionEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lateToleranceMinutes" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "maxDevicesPerStudent" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "maxQrRegenerations" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "SchoolClass" ADD COLUMN     "programId" TEXT;

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "credits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "facultyId" TEXT;

-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN     "department" TEXT,
ADD COLUMN     "facultyId" TEXT,
ADD COLUMN     "hireDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Faculty" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "deanName" TEXT,
    "establishmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Faculty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudAlert" (
    "id" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "type" "FraudType" NOT NULL,
    "severity" "FraudSeverity" NOT NULL,
    "status" "FraudStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "establishmentId" TEXT NOT NULL,
    "sessionId" TEXT,
    "studentId" TEXT,
    "attendanceRecordId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,

    CONSTRAINT "FraudAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Faculty_establishmentId_idx" ON "Faculty"("establishmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Faculty_establishmentId_code_key" ON "Faculty"("establishmentId", "code");

-- CreateIndex
CREATE INDEX "Program_facultyId_idx" ON "Program"("facultyId");

-- CreateIndex
CREATE UNIQUE INDEX "Program_establishmentId_code_key" ON "Program"("establishmentId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "FraudAlert_signature_key" ON "FraudAlert"("signature");

-- CreateIndex
CREATE INDEX "FraudAlert_establishmentId_status_idx" ON "FraudAlert"("establishmentId", "status");

-- CreateIndex
CREATE INDEX "FraudAlert_establishmentId_detectedAt_idx" ON "FraudAlert"("establishmentId", "detectedAt");

-- CreateIndex
CREATE INDEX "FraudAlert_sessionId_idx" ON "FraudAlert"("sessionId");

-- CreateIndex
CREATE INDEX "FraudAlert_studentId_idx" ON "FraudAlert"("studentId");

-- CreateIndex
CREATE INDEX "AdminUser_establishmentId_idx" ON "AdminUser"("establishmentId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_deviceFingerprint_idx" ON "AttendanceRecord"("deviceFingerprint");

-- CreateIndex
CREATE INDEX "AttendanceRecord_ipAddress_idx" ON "AttendanceRecord"("ipAddress");

-- AddForeignKey
ALTER TABLE "Faculty" ADD CONSTRAINT "Faculty_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "Faculty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "Faculty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "Faculty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudAlert" ADD CONSTRAINT "FraudAlert_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudAlert" ADD CONSTRAINT "FraudAlert_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudAlert" ADD CONSTRAINT "FraudAlert_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudAlert" ADD CONSTRAINT "FraudAlert_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "AttendanceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudAlert" ADD CONSTRAINT "FraudAlert_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
