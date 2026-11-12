import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { loginSchema } from '@ananda-agents/shared';
import { Public } from '../core/context';
import { ZodPipe } from '../core/zod.pipe';
import { AuthService } from './auth.service';
import { SESSION_COOKIE } from './auth.guard';

const secure = () => process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodPipe(loginSchema)) body: { email: string; password: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { token, user, expires } = await this.auth.login(body.email, body.password, req.ip ?? '');
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: secure(), expires, path: '/' });
    return { id: user.id, role: user.role, locale: user.locale };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }
}
