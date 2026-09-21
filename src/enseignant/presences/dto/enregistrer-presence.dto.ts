/**
 * DTO pour enregistrer ou modifier une présence
 */
import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';

export class EnregistrerPresenceDto {
  @IsString({ message: 'L\'identifiant de la session est requis' })
  @IsNotEmpty({ message: 'L\'identifiant de la session ne peut pas être vide' })
  sessionId!: string;

  @IsString({ message: 'L\'identifiant de l\'étudiant est requis' })
  @IsNotEmpty({ message: 'L\'identifiant de l\'étudiant ne peut pas être vide' })
  studentId!: string;

  @IsEnum(['present', 'late', 'absent'], {
    message: 'Le statut doit être "present", "late" ou "absent"',
  })
  status!: 'present' | 'late' | 'absent';
}
