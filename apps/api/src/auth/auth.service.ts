import { HttpException, HttpStatus, Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { and, eq, gt, sql } from 'drizzle-orm';
import { InjectDb, type Db } from '../db/db.module';
import { loginAttempts, sessions, users } from '../db/schema';
import { randomToken, sha256 } from '../core/crypto';
import { AuditService } from '../core/audit.service';
import type { AuthUser } from '../core/context';

const SESSION_DAYS = 30;
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60_000;

@Injectable()
export class AuthService {
  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, ip: string): Promise<{ token: string; user: AuthUser; expires: Date }> {
    // Stored in Postgres, not in memory, so the limit holds when several API instances run (Vercel).
    const key = sha256(`${email.toLowerCase()}|${ip}`);
    const windowStart = new Date(Date.now() - WINDOW_MS);
    const [a] = await this.db.select().from(loginAttempts).where(eq(loginAttempts.key, key));
    if (a && a.firstAt > windowStart && a.n >= MAX_ATTEMPTS) {
      throw new HttpException({ message: 'too_many_attempts' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    const [u] = await this.db.select().from(users).where(eq(users.email, email));
    if (!u || !u.active || !(await bcrypt.compare(password, u.passwordHash))) {
      // One atomic upsert: count within the current window, or start a new one.
      const inWindow = sql`${loginAttempts.firstAt} > ${windowStart.toISOString()}`;
      await this.db
        .insert(loginAttempts)
        .values({ key, n: 1, firstAt: new Date() })
        .onConflictDoUpdate({
          target: loginAttempts.key,
          set: {
            n: sql`case when ${inWindow} then ${loginAttempts.n} + 1 else 1 end`,
            firstAt: sql`case when ${inWindow} then ${loginAttempts.firstAt} else now() end`,
          },
        });
      throw new UnauthorizedException({ message: 'bad_credentials' });
    }
    await this.db.delete(loginAttempts).where(eq(loginAttempts.key, key));
    const token = randomToken();
    const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    await this.db.insert(sessions).values({ userId: u.id, tokenHash: sha256(token), expiresAt: expires });
    await this.audit.log(u.id, 'login', 'user', u.id);
    return { token, expires, user: { id: u.id, name: u.name, email: u.email, role: u.role, locale: u.locale } };
  }

  async userForToken(token: string | undefined): Promise<AuthUser | null> {
    if (!token) return null;
    const [row] = await this.db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, locale: users.locale, active: users.active })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())));
    if (!row || !row.active) return null;
    return { id: row.id, name: row.name, email: row.email, role: row.role, locale: row.locale };
  }

  async logout(token: string | undefined) {
    if (token) await this.db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  }
}
