/**
 * DTO de modification du profil enseignant
 * Seules les informations autorisées peuvent être modifiées (pas l'email ni le rôle)
 */
import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class ModifierProfilDto {
  @IsOptional()
  @IsString({ message: 'Le prénom doit être une chaîne de caractères' })
  @MinLength(1, { message: 'Le prénom ne peut pas être vide' })
  @MaxLength(100, { message: 'Le prénom ne peut pas dépasser 100 caractères' })
  firstName?: string;

  @IsOptional()
  @IsString({ message: 'Le nom doit être une chaîne de caractères' })
  @MinLength(1, { message: 'Le nom ne peut pas être vide' })
  @MaxLength(100, { message: 'Le nom ne peut pas dépasser 100 caractères' })
  lastName?: string;
}
