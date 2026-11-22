import { HttpException, HttpStatus, Injectable, BadRequestException, Inject, Logger } from '@nestjs/common';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import QRCode from 'qrcode';
import type { Locale } from '@ananda-agents/shared';
import { InjectDb, type Db } from '../db/db.module';
import { loginAttempts, loginLinks, sessions, users } from '../db/schema';
import { decrypt, encrypt, randomToken, sha256 } from '../core/crypto';
import { AuditService } from '../core/audit.service';
import { MailService } from '../core/mail.service';
import type { AuthUser } from '../core/context';
import { matchStep, newRecoveryCodes, newSecret, normaliseRecovery, otpauthUrl } from './totp';
import { signInLinkEmail } from './emails';

const SESSION_DAYS = 30;
/** A session that passed the first step (link or Google) but not the authenticator code yet. */
const PENDING_MINUTES = 15;
const LINK_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60_000;

export interface SessionUser extends AuthUser {
  /** True until the second step passes; such a session reaches only the two-step endpoints. */
  pending: boolean;
  twoStepOn: boolean;
}

/** Sign-in: an e-mail link or Google, then two-step verification with an authenticator app (client
 *  decision, Nov 2026). No passwords. */
@Injectable()
export class AuthService {
  private readonly log = new Logger('Auth');

  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  // ---------- Attempt limits, stored in Postgres so they hold across instances ----------

  private async blocked(scope: string, id: string) {
    const [a] = await this.db.select().from(loginAttempts).where(eq(loginAttempts.key, sha256(`${scope}|${id}`)));
    return !!a && a.firstAt > new Date(Date.now() - WINDOW_MS) && a.n >= MAX_ATTEMPTS;
  }

  private async count(scope: string, id: string) {
    const key = sha256(`${scope}|${id}`);
    const inWindow = sql`${loginAttempts.firstAt} > ${new Date(Date.now() - WINDOW_MS).toISOString()}`;
    await this.db
      .insert(loginAttempts)
      .values({ key, n: 1, firstAt: new Date() })
      .onConflictDoUpdate({
        target: loginAttempts.key,
        set: { n: sql`case when ${inWindow} then ${loginAttempts.n} + 1 else 1 end`, firstAt: sql`case when ${inWindow} then ${loginAttempts.firstAt} else now() end` },
      });
  }

  private async clear(scope: string, id: string) {
    await this.db.delete(loginAttempts).where(eq(loginAttempts.key, sha256(`${scope}|${id}`)));
  }

  private tooMany(): never {
    throw new HttpException({ message: 'too_many_attempts' }, HttpStatus.TOO_MANY_REQUESTS);
  }

  // ---------- First step: e-mail link ----------

  /** Always answers the same way, so it never reveals whether an address has an account. */
  async requestLink(emailIn: string, ip: string, next: string | null) {
    const email = emailIn.trim().toLowerCase();
    if (await this.blocked('link', `${email}|${ip}`)) this.tooMany();
    await this.count('link', `${email}|${ip}`);
    const [u] = await this.db.select().from(users).where(eq(users.email, email));
    if (!u || !u.active) return;
    const token = randomToken();
    await this.db.insert(loginLinks).values({ userId: u.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + LINK_MINUTES * 60_000) });
    const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3020';
    const url = `${origin}/login/verify?token=${token}${next ? `&next=${encodeURIComponent(next)}` : ''}`;
    const mail = signInLinkEmail(u.locale, u.name, url, LINK_MINUTES);
    try {
      await this.mail.send({ to: u.email, subject: mail.subject, text: mail.text });
    } catch (e) {
      this.log.error(`Sign-in link not sent to ${u.id}: ${(e as Error).message}`);
      throw new HttpException({ message: 'mail_failed' }, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /** Single use, 15 minutes. Starts a session that still needs the authenticator code. */
  async useLink(token: string) {
    const [link] = await this.db.select().from(loginLinks).where(eq(loginLinks.tokenHash, sha256(token)));
    if (!link) throw new BadRequestException({ message: 'link_invalid' });
    if (link.usedAt) throw new BadRequestException({ message: 'link_used' });
    if (link.expiresAt < new Date()) throw new BadRequestException({ message: 'link_expired' });
    // Claim it atomically: two clicks on the same link start one session.
    const claimed = await this.db
      .update(loginLinks)
      .set({ usedAt: new Date() })
      .where(and(eq(loginLinks.id, link.id), isNull(loginLinks.usedAt)))
      .returning({ id: loginLinks.id });
    if (!claimed.length) throw new BadRequestException({ message: 'link_used' });
    const [u] = await this.db.select().from(users).where(eq(users.id, link.userId));
    if (!u?.active) throw new BadRequestException({ message: 'link_invalid' });
    return this.startSession(u.id);
  }

  // ---------- First step: Google ----------

  /** Google only proves the address; the account must already exist (Brokers join by invite). */
  async googleSignIn(emailIn: string) {
    const [u] = await this.db.select().from(users).where(eq(users.email, emailIn.trim().toLowerCase()));
    if (!u || !u.active) return null;
    return this.startSession(u.id);
  }

  private async startSession(userId: string) {
    const token = randomToken();
    const expires = new Date(Date.now() + PENDING_MINUTES * 60_000);
    await this.db.insert(sessions).values({ userId, tokenHash: sha256(token), expiresAt: expires });
    return { token, expires };
  }

  // ---------- Sessions ----------

  async userForToken(token: string | undefined): Promise<SessionUser | null> {
    if (!token) return null;
    const [row] = await this.db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, locale: users.locale, active: users.active, mfaAt: sessions.mfaAt, totpEnabledAt: users.totpEnabledAt })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())));
    if (!row || !row.active) return null;
    return { id: row.id, name: row.name, email: row.email, role: row.role, locale: row.locale as Locale, pending: !row.mfaAt, twoStepOn: !!row.totpEnabledAt };
  }

  async logout(token: string | undefined) {
    if (token) await this.db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  }

  private async completeSession(userId: string, token: string) {
    const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    await this.db.update(sessions).set({ mfaAt: new Date(), expiresAt: expires }).where(eq(sessions.tokenHash, sha256(token)));
    await this.audit.log(userId, 'login', 'user', userId);
    const [u] = await this.db.select({ role: users.role, locale: users.locale, theme: users.theme }).from(users).where(eq(users.id, userId));
    return { expires, role: u.role, locale: u.locale, theme: u.theme };
  }

  // ---------- Second step: authenticator app ----------

  /** First time only: a new secret to scan. Kept as pending until a code confirms it. */
  async setupTwoStep(user: SessionUser) {
    if (user.twoStepOn) throw new BadRequestException({ message: 'already_on' });
    const secret = newSecret();
    await this.db.update(users).set({ totpPendingEnc: encrypt(secret) }).where(eq(users.id, user.id));
    const url = otpauthUrl(secret, user.email);
    const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    return { secret: secret.replace(/(.{4})/g, '$1 ').trim(), qrSvg, otpauthUrl: url };
  }

  /** Confirms set-up with a first code, finishes sign-in and returns the recovery codes (shown once). */
  async enableTwoStep(user: SessionUser, token: string, code: string) {
    if (user.twoStepOn) throw new BadRequestException({ message: 'already_on' });
    if (await this.blocked('mfa', user.id)) this.tooMany();
    const [u] = await this.db.select().from(users).where(eq(users.id, user.id));
    const secret = u.totpPendingEnc ? decrypt(u.totpPendingEnc) : null;
    const step = secret ? matchStep(secret, code.trim()) : null;
    if (!secret || step === null) {
      await this.count('mfa', user.id);
      throw new BadRequestException({ message: 'bad_code' });
    }
    await this.clear('mfa', user.id);
    const recovery = newRecoveryCodes();
    await this.db
      .update(users)
      .set({ totpSecretEnc: encrypt(secret), totpPendingEnc: null, totpEnabledAt: new Date(), totpLastStep: step, recoveryCodes: recovery.map((c) => sha256(normaliseRecovery(c))) })
      .where(eq(users.id, user.id));
    await this.audit.log(user.id, 'auth.two_step_on', 'user', user.id);
    return { ...(await this.completeSession(user.id, token)), recoveryCodes: recovery };
  }

  /** Finishes sign-in with an authenticator code or a one-time recovery code. */
  async verifyTwoStep(user: SessionUser, token: string, code: string) {
    if (!user.twoStepOn) throw new BadRequestException({ message: 'setup_required' });
    if (!(await this.checkCode(user.id, code, { allowRecovery: true }))) throw new BadRequestException({ message: 'bad_code' });
    return this.completeSession(user.id, token);
  }

  /** The one check behind sign-in and step-up actions (confirming a payment): limited to 5 tries per
   *  15 minutes, and each code works once. */
  async checkCode(userId: string, codeIn: string, opts: { allowRecovery?: boolean } = {}): Promise<boolean> {
    if (await this.blocked('mfa', userId)) this.tooMany();
    const [u] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!u?.totpSecretEnc) throw new BadRequestException({ message: 'setup_required' });
    const code = codeIn.trim();
    const step = matchStep(decrypt(u.totpSecretEnc)!, code);
    if (step !== null && (u.totpLastStep === null || step > u.totpLastStep)) {
      // Claim the step atomically, so the same code can't pass twice even from two requests at once.
      const claimed = await this.db
        .update(users)
        .set({ totpLastStep: step })
        .where(and(eq(users.id, userId), sql`coalesce(${users.totpLastStep}, -1) < ${step}`))
        .returning({ id: users.id });
      if (claimed.length) {
        await this.clear('mfa', userId);
        return true;
      }
    }
    if (opts.allowRecovery && !/^\d{6}$/.test(code)) {
      const hash = sha256(normaliseRecovery(code));
      if (u.recoveryCodes.includes(hash)) {
        await this.db.update(users).set({ recoveryCodes: u.recoveryCodes.filter((h) => h !== hash) }).where(eq(users.id, userId));
        await this.audit.log(userId, 'auth.recovery_code_used', 'user', userId, { left: u.recoveryCodes.length - 1 });
        await this.clear('mfa', userId);
        return true;
      }
    }
    await this.count('mfa', userId);
    return false;
  }
}
