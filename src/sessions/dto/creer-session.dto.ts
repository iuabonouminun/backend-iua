import { IsString, IsNotEmpty, IsDateString, IsOptional } from 'class-validator';

export class CreerSessionDto {
  @IsString()
  @IsNotEmpty()
  subjectId!: string;

  @IsDateString({}, { message: 'La date doit être au format ISO' })
  date!: string;

  @IsString()
  @IsNotEmpty()
  startTime!: string;

  @IsString()
  @IsNotEmpty()
  endTime!: string;

  /**
   * Optionnels : si absents, on tente de les déduire de l'emploi du temps
   * de la classe (ScheduleEntry correspondant au même jour/matière/heure).
   */
  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  room?: string;
}
