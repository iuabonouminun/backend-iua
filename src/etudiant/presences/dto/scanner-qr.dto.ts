/**
 * REMPLACE src/etudiant/presences/dto/scanner-qr.dto.ts
 *
 * Ajoute la traçabilité technique du scan. Sans ces champs, le moteur
 * anti-fraude est aveugle : impossible de voir qu'un même téléphone a pointé
 * douze étudiants. Tous les champs restent optionnels — un ancien client
 * continue de fonctionner, il produit simplement moins de signal.
 */
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class ScannerQrDto {
  @IsString()
  token!: string;

  /**
   * Empreinte stable de l'appareil, calculée côté client (student-app).
   * Ce n'est pas un identifiant nominatif : c'est un hachage local.
   */
  @IsOptional()
  @IsString()
  @Length(8, 128)
  deviceFingerprint?: string;

  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;

  @IsOptional() @IsInt() @Min(0) @Max(100_000) accuracyMeters?: number;
}
