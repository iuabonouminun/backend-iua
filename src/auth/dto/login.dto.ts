/**
 * DTO de connexion — valide les identifiants de l'enseignant
 */
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'L\'email doit être une adresse valide' })
  email!: string;

  @IsString({ message: 'Le mot de passe doit être une chaîne de caractères' })
  @MinLength(6, { message: 'Le mot de passe doit contenir au moins 6 caractères' })
  password!: string;
}
