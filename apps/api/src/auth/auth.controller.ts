import { Body, Controller, Get, HttpCode, Post, Query, Req, Res, Inject, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { codeSchema, linkRequestSchema, linkVerifySchema, type SignedIn, type TwoStepState } from '@ananda-agents/shared';
import { AllowPending, CurrentUser, Public } from '../core/context';
import { randomToken } from '../core/crypto';
import { ZodPipe } from '../core/zod.pipe';
import { AuthService, type SessionUser } from './auth.service';
import { SESSION_COOKIE } from './auth.guard';

const OAUTH_COOKIE = 'aa_oauth';
const secure = () => process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production';
const safeNext = (n: unknown) => (typeof n === 'string' && /^\/(?!\/)/.test(n) && n.length <= 300 ? n : null);

const google = () => {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) return null;
  const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3020';
  return { id, secret, redirect: `${origin}/api/auth/google/callback` };
};

/** Sign-in is two steps (client decision): an e-mail link or Google, then the authenticator-app code. */
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  private setSession(res: Response, token: string, expires: Date) {
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: secure(), expires, path: '/' });
  }

  @Public()
  @Get('config')
  config() {
    return { google: !!google() };
  }

  // ---------- First step: e-mail link ----------

  @Public()
  @Post('link')
  @HttpCode(202)
  async requestLink(@Body(new ZodPipe(linkRequestSchema)) body: { email: string; next?: string }, @Req() req: Request) {
    await this.auth.requestLink(body.email, req.ip ?? '', safeNext(body.next));
    return { sent: true };
  }

  @Public()
  @Post('link/verify')
  @HttpCode(200)
  async verifyLink(@Body(new ZodPipe(linkVerifySchema)) body: { token: string }, @Res({ passthrough: true }) res: Response) {
    const { token, expires } = await this.auth.useLink(body.token);
    this.setSession(res, token, expires);
    return { next: 'two-step' };
  }

  // ---------- First step: Google (OpenID Connect, authorisation code flow) ----------

  @Public()
  @Get('google')
  startGoogle(@Query('next') next: string | undefined, @Res() res: Response) {
    const g = google();
    if (!g) throw new NotFoundException('not_found');
    const state = randomToken(16);
    const nonce = randomToken(16);
    res.cookie(OAUTH_COOKIE, JSON.stringify({ state, nonce, next: safeNext(next) }), { httpOnly: true, sameSite: 'lax', secure: secure(), maxAge: 10 * 60_000, path: '/api/auth' });
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: g.id, redirect_uri: g.redirect, response_type: 'code', scope: 'openid email', state, nonce, prompt: 'select_account' }).toString();
    res.redirect(url.toString());
  }

  @Public()
  @Get('google/callback')
  async googleCallback(@Query('code') code: string | undefined, @Query('state') state: string | undefined, @Req() req: Request, @Res() res: Response) {
    const fail = (why: string) => res.redirect(`/login?error=${why}`);
    const g = google();
    let saved: { state?: string; nonce?: string; next?: string | null } = {};
    try {
      saved = JSON.parse(req.cookies?.[OAUTH_COOKIE] ?? '{}');
    } catch {}
    res.clearCookie(OAUTH_COOKIE, { path: '/api/auth' });
    if (!g || !code || !state || state !== saved.state) return fail('google_failed');
    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: g.id, client_secret: g.secret, redirect_uri: g.redirect, grant_type: 'authorization_code' }),
      });
      if (!tokenRes.ok) return fail('google_failed');
      const { id_token } = (await tokenRes.json()) as { id_token?: string };
      // The ID token comes straight from Google's token endpoint over TLS, so its claims are checked
      // rather than its signature (OpenID Connect Core 3.1.3.7).
      const claims = JSON.parse(Buffer.from(String(id_token).split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<string, unknown>;
      const valid =
        claims.aud === g.id &&
        (claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com') &&
        Number(claims.exp) * 1000 > Date.now() &&
        claims.nonce === saved.nonce &&
        claims.email_verified === true &&
        typeof claims.email === 'string';
      if (!valid) return fail('google_failed');
      const session = await this.auth.googleSignIn(claims.email as string);
      if (!session) return fail('google_no_account');
      this.setSession(res, session.token, session.expires);
      res.redirect(`/login/two-step${saved.next ? `?next=${encodeURIComponent(saved.next)}` : ''}`);
    } catch {
      return fail('google_failed');
    }
  }

  // ---------- Second step: authenticator app ----------

  @AllowPending()
  @Get('two-step')
  state(@CurrentUser() u: SessionUser): TwoStepState {
    return { on: u.twoStepOn, pending: u.pending, email: u.email };
  }

  @AllowPending()
  @Post('two-step/setup')
  @HttpCode(200)
  setup(@CurrentUser() u: SessionUser) {
    return this.auth.setupTwoStep(u);
  }

  @AllowPending()
  @Post('two-step/enable')
  @HttpCode(200)
  async enable(@Body(new ZodPipe(codeSchema)) body: { code: string }, @CurrentUser() u: SessionUser, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SignedIn> {
    const token = this.sessionToken(req);
    const out = await this.auth.enableTwoStep(u, token, body.code);
    this.setSession(res, token, out.expires);
    return { role: out.role, locale: out.locale, theme: out.theme, recoveryCodes: out.recoveryCodes };
  }

  @AllowPending()
  @Post('two-step/verify')
  @HttpCode(200)
  async verify(@Body(new ZodPipe(codeSchema)) body: { code: string }, @CurrentUser() u: SessionUser, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SignedIn> {
    const token = this.sessionToken(req);
    const out = await this.auth.verifyTwoStep(u, token, body.code);
    this.setSession(res, token, out.expires);
    return { role: out.role, locale: out.locale, theme: out.theme };
  }

  private sessionToken(req: Request): string {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException();
    return token;
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }
}
