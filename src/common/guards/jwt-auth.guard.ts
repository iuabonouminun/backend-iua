/**
 * Guard JWT — vérifie que la requête provient d'un enseignant authentifié
 * Appliqué sur toutes les routes protégées de l'espace enseignant
 */
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
