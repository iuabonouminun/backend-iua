import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class EtudiantJwtAuthGuard extends AuthGuard('jwt-etudiant') {}
