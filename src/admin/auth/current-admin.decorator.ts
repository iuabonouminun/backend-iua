import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AdminContext {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'OBSERVATEUR';
  establishmentId: string;
}

/** Injecte l'admin connecté : @CurrentAdmin() admin: AdminContext */
export const CurrentAdmin = createParamDecorator(
  (data: keyof AdminContext | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest().user;
    return data ? user?.[data] : user;
  },
);
