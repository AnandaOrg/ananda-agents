import { BadRequestException, Body, Controller, Get, Patch, Put, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { bankFromIban, isValidIban, maskIban, normaliseIban, paymentDetailsSchema, profileSchema, type Locale, type Me } from '@ananda-agents/shared';
import { InjectDb, type Db } from '../db/db.module';
import { users } from '../db/schema';
import { encrypt } from '../core/crypto';
import { AuditService } from '../core/audit.service';
import { CurrentUser, type AuthUser } from '../core/context';
import { ZodPipe } from '../core/zod.pipe';

@Controller('me')
export class MeController {
  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  async me(@CurrentUser() user: AuthUser): Promise<Me> {
    const [u] = await this.db.select().from(users).where(eq(users.id, user.id));
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      locale: u.locale,
      // The full IBAN never leaves the server; the agent sees the masked form (PRD NFR Privacy).
      payment: { accountHolder: u.accountHolder ?? u.name, ibanMasked: maskIban(u.ibanLast4), bank: u.bank, bic: u.bic, isSet: !!u.ibanEnc },
    };
  }

  @Patch()
  async update(@CurrentUser() user: AuthUser, @Body(new ZodPipe(profileSchema)) body: { locale: Locale }) {
    await this.db.update(users).set({ locale: body.locale }).where(eq(users.id, user.id));
    return { locale: body.locale };
  }

  /** UC-12: IBAN checked locally (mod-97); bank and BIC derived from it; stored encrypted. */
  @Put('payment-details')
  async payment(@CurrentUser() user: AuthUser, @Body(new ZodPipe(paymentDetailsSchema)) body: { accountHolder: string; iban: string }) {
    const iban = normaliseIban(body.iban);
    if (!isValidIban(iban)) throw new BadRequestException({ message: 'invalid', fields: { iban: 'invalid_iban' } });
    const bank = bankFromIban(iban);
    await this.db
      .update(users)
      .set({ accountHolder: body.accountHolder, ibanEnc: encrypt(iban), ibanLast4: iban.slice(-4), bank: bank?.bank ?? null, bic: bank?.bic ?? null })
      .where(eq(users.id, user.id));
    await this.audit.log(user.id, 'payment_details.update', 'user', user.id, { ibanLast4: iban.slice(-4) });
    return { ibanMasked: maskIban(iban.slice(-4)), bank: bank?.bank ?? null, bic: bank?.bic ?? null };
  }

  /** Preview while typing: is it valid, and which bank? Nothing is stored. */
  @Put('payment-details/check')
  check(@Body() body: { iban?: string }) {
    const iban = normaliseIban(String(body?.iban ?? ''));
    return { valid: isValidIban(iban), ...(bankFromIban(iban) ?? { bank: null, bic: null }) };
  }
}
