/**
 * DTOs de l'espace Administrateur.
 * Toutes les entrées passent par class-validator (ValidationPipe global,
 * whitelist + forbidNonWhitelisted déjà actifs dans main.ts).
 */
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  MinLength,
} from 'class-validator';

/* ------------------------------- Auth admin ------------------------------- */

export class AdminLoginDto {
  @IsEmail({}, { message: 'Adresse email invalide' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(10, { message: 'Le nouveau mot de passe doit contenir au moins 10 caractères' })
  newPassword!: string;
}

/* --------------------- Gestion des comptes administrateurs --------------------- */
/**
 * Réservé au(x) SUPER_ADMIN : c'est lui qui provisionne tous les autres
 * comptes administrateurs (ADMIN, OBSERVATEUR, voire un autre SUPER_ADMIN).
 */

export class CreateAdminDto {
  @IsString() @Length(2, 60) firstName!: string;
  @IsString() @Length(2, 60) lastName!: string;
  @IsEmail() email!: string;

  @IsOptional()
  @IsEnum(['SUPER_ADMIN', 'ADMIN', 'OBSERVATEUR'] as const)
  role?: 'SUPER_ADMIN' | 'ADMIN' | 'OBSERVATEUR';

  /** Si absent, un mot de passe temporaire est généré et renvoyé une seule fois. */
  @IsOptional() @IsString() @MinLength(10) password?: string;
}

export class UpdateAdminDto {
  @IsOptional() @IsString() @Length(2, 60) firstName?: string;
  @IsOptional() @IsString() @Length(2, 60) lastName?: string;
  @IsOptional() @IsEmail() email?: string;

  @IsOptional()
  @IsEnum(['SUPER_ADMIN', 'ADMIN', 'OBSERVATEUR'] as const)
  role?: 'SUPER_ADMIN' | 'ADMIN' | 'OBSERVATEUR';
}

/* --------------------------- Gestion des accès ---------------------------- */

export class CreateStudentDto {
  @IsString() @Length(2, 40) matricule!: string;
  @IsString() @Length(2, 60) firstName!: string;
  @IsString() @Length(2, 60) lastName!: string;
  @IsEmail() email!: string;
  @IsString() classId!: string;
  @IsOptional() @IsString() @MinLength(10) password?: string;
}

export class UpdateStudentDto {
  @IsOptional() @IsString() @Length(2, 60) firstName?: string;
  @IsOptional() @IsString() @Length(2, 60) lastName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() classId?: string;
  @IsOptional() @IsString() matricule?: string;
}

export class CreateTeacherDto {
  @IsString() @Length(2, 60) firstName!: string;
  @IsString() @Length(2, 60) lastName!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() facultyId?: string;
  @IsOptional() @IsString() @MinLength(10) password?: string;
}

export class UpdateTeacherDto {
  @IsOptional() @IsString() @Length(2, 60) firstName?: string;
  @IsOptional() @IsString() @Length(2, 60) lastName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() facultyId?: string;
}

export class SuspendAccountDto {
  @IsOptional() @IsString() @Length(3, 300) reason?: string;
}

export class ResetPasswordDto {
  /** Si absent, un mot de passe temporaire est généré et renvoyé une seule fois. */
  @IsOptional() @IsString() @MinLength(10) newPassword?: string;
}

export class AssignLeaderDto {
  @IsString() studentId!: string;

  /** true = chef de classe, false = suppléant */
  @IsOptional() @IsBoolean() isDeputy?: boolean;
}

/* ------------------------- Référentiel académique ------------------------- */

export class CreateFacultyDto {
  @IsString() @Length(2, 120) name!: string;
  @IsString() @Length(2, 20) code!: string;
  @IsOptional() @IsString() deanName?: string;
}

export class CreateProgramDto {
  @IsString() @Length(2, 120) name!: string;
  @IsString() @Length(2, 20) code!: string;
  @IsString() level!: string;
  @IsString() facultyId!: string;
}

export class CreateSubjectDto {
  @IsString() @Length(2, 120) name!: string;
  @IsString() @Length(2, 20) code!: string;
  @IsInt() @Min(1) @Max(500) volumeHours!: number;
  @IsOptional() @IsInt() @Min(0) @Max(60) credits?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() facultyId?: string;
}

export class CreateClassDto {
  @IsString() @Length(1, 80) name!: string;
  @IsString() level!: string;
  @IsString() program!: string;
  @IsOptional() @IsString() programId?: string;
}

export class CreateAssignmentDto {
  @IsString() teacherId!: string;
  @IsString() subjectId!: string;
  @IsString() classId!: string;
}

/* ----------------------------------- Salles --------------------------------- */

export class CreateRoomDto {
  @IsString() @Length(1, 40) name!: string;
  @IsEnum(['CM', 'TD'] as const) type!: 'CM' | 'TD';
  @IsInt() @Min(1) capacity!: number;
}

export class UpdateRoomDto {
  @IsOptional() @IsString() @Length(1, 40) name?: string;
  @IsOptional() @IsEnum(['CM', 'TD'] as const) type?: 'CM' | 'TD';
  @IsOptional() @IsInt() @Min(1) capacity?: number;
}

export class CreateScheduleDto {
  @IsString() classId!: string;
  @IsString() subjectId!: string;
  @IsString() teacherId!: string;
  @IsString() roomId!: string;
  @IsEnum(['CM', 'TD'] as const) sessionType!: 'CM' | 'TD';
  @IsInt() @Min(1) @Max(7) dayOfWeek!: number;
  @IsString() @Length(5, 5) startTime!: string;
  @IsString() @Length(5, 5) endTime!: string;
}

export class UpdateScheduleDto {
  @IsOptional() @IsString() classId?: string;
  @IsOptional() @IsString() subjectId?: string;
  @IsOptional() @IsString() teacherId?: string;
  @IsOptional() @IsString() roomId?: string;
  @IsOptional() @IsEnum(['CM', 'TD'] as const) sessionType?: 'CM' | 'TD';
  @IsOptional() @IsInt() @Min(1) @Max(7) dayOfWeek?: number;
  @IsOptional() @IsString() @Length(5, 5) startTime?: string;
  @IsOptional() @IsString() @Length(5, 5) endTime?: string;
}

/* -------------------------------- Présences ------------------------------- */

export class UpdateAttendanceDto {
  @IsEnum(['present', 'late', 'absent', 'rejected'] as const)
  status!: 'present' | 'late' | 'absent' | 'rejected';

  @IsOptional() @IsString() @Length(3, 300) note?: string;
}

export class ManualAttendanceDto {
  @IsString() sessionId!: string;
  @IsString() studentId!: string;
  @IsEnum(['present', 'late', 'absent'] as const)
  status!: 'present' | 'late' | 'absent';
  @IsString() @Length(3, 300) note!: string;
}

/* ------------------------------- Anti-fraude ------------------------------ */

export class ReviewAlertDto {
  @IsEnum(['CONFIRMED', 'DISMISSED', 'RESOLVED'] as const)
  status!: 'CONFIRMED' | 'DISMISSED' | 'RESOLVED';

  @IsOptional() @IsString() @Length(3, 500) note?: string;

  /** Si true et statut CONFIRMED : la présence liée est invalidée (status = rejected). */
  @IsOptional() @IsBoolean() invalidateAttendance?: boolean;
}

export class RunDetectionDto {
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
}

/* ------------------------------- Paramètres ------------------------------- */

export class UpdateSettingsDto {
  @IsOptional() @IsString() institutionName?: string;
  @IsOptional() @IsString() academicYear?: string;
  @IsOptional() @IsEnum(['S1', 'S2'] as const) currentSemester?: 'S1' | 'S2';
  @IsOptional() @IsInt() @Min(1) @Max(240) qrValidityMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(120) lateToleranceMinutes?: number;
  @IsOptional() @IsBoolean() autoCloseSessions?: boolean;
  @IsOptional() @IsBoolean() allowManualAttendance?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(100) attendanceAlertThreshold?: number;
  @IsOptional() @IsBoolean() notifyOnScheduleConflict?: boolean;
  @IsOptional() @IsBoolean() notifyOnLowAttendance?: boolean;
  @IsOptional() @IsBoolean() notifyOnSessionExpired?: boolean;
  @IsOptional() @IsEnum(['pdf', 'docx', 'xlsx'] as const) defaultExportFormat?: 'pdf' | 'docx' | 'xlsx';

  // Anti-fraude
  @IsOptional() @IsBoolean() fraudDetectionEnabled?: boolean;
  @IsOptional() @IsLatitude() campusLatitude?: number;
  @IsOptional() @IsLongitude() campusLongitude?: number;
  @IsOptional() @IsInt() @Min(20) @Max(20000) campusRadiusMeters?: number;
  @IsOptional() @IsInt() @Min(1) @Max(10) maxDevicesPerStudent?: number;
  @IsOptional() @IsInt() @Min(1) @Max(20) maxQrRegenerations?: number;
  @IsOptional() @IsInt() @Min(3) @Max(300) burstScanWindowSeconds?: number;
  @IsOptional() @IsInt() @Min(2) @Max(100) burstScanThreshold?: number;
}
