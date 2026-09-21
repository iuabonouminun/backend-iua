/**
 * Interface étendue de Request — ajoute la propriété `user` pour TypeScript
 */
import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    externalUserId: string;
    establishmentId: string;
    status: string;
    [key: string]: unknown;
  };
}
