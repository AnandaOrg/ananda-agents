import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Locale, Role } from '@ananda-agents/shared';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  locale: Locale;
}

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Reachable by a session that passed the first sign-in step but not the authenticator code yet. */
export const ALLOW_PENDING = 'allowPending';
export const AllowPending = () => SetMetadata(ALLOW_PENDING, true);
export const ROLES = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);
