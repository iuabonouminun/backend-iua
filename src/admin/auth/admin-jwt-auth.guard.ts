import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Exige un jeton admin valide (stratégie "jwt-admin"). */
@Injectable()
export class AdminJwtAuthGuard extends AuthGuard('jwt-admin') {}
