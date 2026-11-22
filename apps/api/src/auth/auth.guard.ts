import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@ananda-agents/shared';
import { ALLOW_PENDING, IS_PUBLIC, ROLES } from '../core/context';
import { AuthService } from './auth.service';

export const SESSION_COOKIE = 'aa_session';

/** Every route needs a signed-in session unless marked @Public(); @Roles() narrows further. A session
 *  still waiting for its authenticator code only reaches routes marked @AllowPending(). */
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
    if (user.pending && !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING, targets)) throw new UnauthorizedException('mfa_required');
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, targets);
    if (roles?.length && !roles.includes(user.role)) throw new ForbiddenException('forbidden');
    req.user = user;
    return true;
  }
}
