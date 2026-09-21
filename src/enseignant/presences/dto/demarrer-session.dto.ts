/**
 * DTO pour démarrer une session de présence
 */
import { IsString, IsNotEmpty, IsDateString } from 'class-validator';

export class DemarrerSessionDto {
  @IsString({ message: 'L\'identifiant de la classe est requis' })
  @IsNotEmpty({ message: 'L\'identifiant de la classe ne peut pas être vide' })
  classId!: string;

  @IsString({ message: 'L\'identifiant du cours est requis' })
  @IsNotEmpty({ message: 'L\'identifiant du cours ne peut pas être vide' })
  subjectId!: string;

  @IsDateString({}, { message: 'La date doit être au format ISO' })
  date!: string;

  @IsString({ message: 'L\'heure de début est requise' })
  @IsNotEmpty({ message: 'L\'heure de début ne peut pas être vide' })
  startTime!: string;

  @IsString({ message: 'L\'heure de fin est requise' })
  @IsNotEmpty({ message: 'L\'heure de fin ne peut pas être vide' })
  endTime!: string;

  @IsString({ message: 'La salle est requise' })
  @IsNotEmpty({ message: 'La salle ne peut pas être vide' })
  room!: string;
}
