import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@ananda-agents/shared';
import { IS_PUBLIC, ROLES } from '../core/context';
import { AuthService } from './auth.service';

export const SESSION_COOKIE = 'aa_session';

/** Every route needs a session unless marked @Public(); @Roles() narrows further. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const req = ctx.switchToHttp().getRequest();
    const user = await this.auth.userForToken(req.cookies?.[SESSION_COOKIE]);
    if (!user) throw new UnauthorizedException();
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, targets);
    if (roles?.length && !roles.includes(user.role)) throw new ForbiddenException();
    req.user = user;
    return true;
  }
}
