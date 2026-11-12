import { BadRequestException, ConflictException, Injectable, Logger, Inject } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  PROFORMA_VALIDITY_DAYS,
  STOCK_HOLD_DAYS,
  addDays,
  calculateOrder,
  commissionBreakdown,
  dueDateFor,
  isoDate,
  ownershipState,
  type SaleInput,
  type SaleSent,
} from '@ananda-agents/shared';
import { InjectDb, type Db } from '../db/db.module';
import { customers, orderLines, orders, requests, users } from '../db/schema';
import { decrypt } from '../core/crypto';
import { AuditService } from '../core/audit.service';
import { MailService } from '../core/mail.service';
import { NotifyService } from '../core/notify.service';
import { NumberingService } from '../core/numbering.service';
import type { AuthUser } from '../core/context';
import { CustomersService } from '../customers/customers.service';
import { ProformaService } from './proforma.service';
import { proformaEmail } from './emails';
import type { OrderRecord } from './order-rows';

@Injectable()
export class SalesService {
  private readonly log = new Logger('Sales');

  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(CustomersService) private readonly customers: CustomersService,
    @Inject(NumberingService) private readonly numbering: NumberingService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(NotifyService) private readonly notify: NotifyService,
    @Inject(ProformaService) private readonly proforma: ProformaService,
  ) {}

  private async existing(user: AuthUser, key: string): Promise<OrderRecord | null> {
    const [o] = await this.db.select().from(orders).where(and(eq(orders.agentId, user.id), eq(orders.idempotencyKey, key)));
    return o ?? null;
  }

  private sent(o: OrderRecord, customerName: string): SaleSent {
    return {
      orderId: o.id,
      number: o.number,
      totalCents: o.totalCents,
      customerName,
      emailedTo: o.emailedTo,
      holdUntil: o.holdUntil,
      commission: commissionBreakdown(o.commissionCents),
    };
  }

  /** UC-06: create the proforma, e-mail it to customer, agent and Admins, and hold stock for 7 days. One action. */
  async send(user: AuthUser, input: SaleInput): Promise<SaleSent> {
    const again = await this.existing(user, input.idempotencyKey);
    if (again) return this.sent(again, again.billTo.name);

    const c = await this.customers.ownCustomer(user, input.customerId);
    if (c.status !== 'active') throw new ConflictException({ message: 'customer_not_active' });
    if (ownershipState(user.id, c) !== 'own') throw new ConflictException({ message: 'not_owner' });

    const [approved] = await this.db
      .select()
      .from(requests)
      .where(and(eq(requests.type, 'price'), eq(requests.status, 'approved'), eq(requests.agentId, user.id), eq(requests.customerId, c.id), isNull(requests.usedByOrderId)))
      .orderBy(desc(requests.decidedAt))
      .limit(1);
    const calc = calculateOrder(input.cartons, c.country, approved?.targetUnitPriceCents ?? null);
    if (!calc.canContinue) throw new BadRequestException({ message: 'no_cartons' });

    const now = new Date();
    let order: OrderRecord;
    try {
      order = await this.db.transaction(async (tx) => {
        const number = await this.numbering.next(tx, 'order');
        const [o] = await tx
          .insert(orders)
          .values({
            number,
            customerId: c.id,
            agentId: user.id,
            language: input.language,
            totalCartons: calc.totalCartons,
            totalUnits: calc.totalUnits,
            tierUnitPriceCents: calc.tierUnitPriceCents,
            unitPriceCents: calc.unitPriceCents,
            netCents: calc.netCents,
            vatRateBp: calc.vatRateBp,
            vatCents: calc.vatCents,
            totalCents: calc.totalCents,
            commissionCents: calc.commission.netCents,
            priceRequestId: calc.discounted ? approved!.id : null,
            billTo: { name: c.name, vatNumber: c.vatNumber, country: c.country, address: c.billingAddress, customerNumber: c.number },
            deliveryAddress: c.deliveryAddress ?? c.billingAddress,
            deliveryInstructions: input.deliveryInstructions?.trim() || null,
            paymentTermsDays: c.paymentTermsDays,
            issuedAt: now,
            validUntil: isoDate(addDays(now, PROFORMA_VALIDITY_DAYS)),
            dueDate: dueDateFor(now, c.paymentTermsDays),
            holdUntil: isoDate(addDays(now, STOCK_HOLD_DAYS)),
            idempotencyKey: input.idempotencyKey,
          })
          .returning();
        await tx.insert(orderLines).values(calc.lines.map((l) => ({ orderId: o.id, ...l })));
        if (calc.discounted) await tx.update(requests).set({ usedByOrderId: o.id }).where(eq(requests.id, approved!.id));
        await tx.update(customers).set({ lastOrderAt: now }).where(eq(customers.id, c.id));
        await this.audit.log(user.id, 'proforma.send', 'order', o.id, { number, totalCents: calc.totalCents, unitPriceCents: calc.unitPriceCents, language: input.language }, tx);
        return o;
      });
    } catch (e) {
      // A double tap that raced past the first check: return the proforma the first request made.
      // Drizzle wraps the driver error, so the Postgres code sits on `cause`.
      const pg = e as { code?: string; cause?: { code?: string } };
      if (pg.code === '23505' || pg.cause?.code === '23505') {
        const first = await this.existing(user, input.idempotencyKey);
        if (first) return this.sent(first, first.billTo.name);
      }
      throw e;
    }

    order = await this.deliver(order, user, c.name, decrypt(c.emailEnc));
    return this.sent(order, c.name);
  }

  private async deliver(order: OrderRecord, user: AuthUser, customerName: string, customerEmail: string | null): Promise<OrderRecord> {
    const [agent] = await this.db.select({ name: users.name, email: users.email, phone: users.phone }).from(users).where(eq(users.id, user.id));
    const lines = await this.db.select().from(orderLines).where(eq(orderLines.orderId, order.id));
    const admins = await this.customers.adminEmails();
    let emailedTo: string | null = null;
    let emailError: string | null = null;
    try {
      if (!customerEmail) throw new Error('Customer has no proforma e-mail');
      const pdf = await this.proforma.render({ order, lines, agent });
      const mail = proformaEmail(order, customerName, agent.name);
      await this.mail.send({
        to: customerEmail,
        cc: [agent.email, ...admins],
        replyTo: agent.email,
        subject: mail.subject,
        text: mail.text,
        attachments: [{ filename: `${order.number}.pdf`, content: pdf, contentType: 'application/pdf' }],
      });
      emailedTo = customerEmail;
    } catch (e) {
      emailError = (e as Error).message;
      this.log.error(`Proforma ${order.number} not e-mailed: ${emailError}`);
      await this.notify.notify(user.id, 'email_bounced', { number: order.number, customer: customerName }, `/orders/${order.id}`);
    }
    const [updated] = await this.db.update(orders).set({ emailedTo, emailError }).where(eq(orders.id, order.id)).returning();
    return updated;
  }
}
