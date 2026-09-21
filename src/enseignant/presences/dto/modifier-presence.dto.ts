/**
 * DTO pour modifier une présence existante
 */
import { IsEnum, IsOptional } from 'class-validator';

export class ModifierPresenceDto {
  @IsEnum(['present', 'late', 'absent'], {
    message: 'Le statut doit être "present", "late" ou "absent"',
  })
  status!: 'present' | 'late' | 'absent';

  @IsOptional()
  scannedAt?: Date;
}
