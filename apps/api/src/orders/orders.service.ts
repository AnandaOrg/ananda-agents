import { ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import {
  REMINDER_COOLDOWN_HOURS,
  isoDate,
  type Collections,
  type Earnings,
  type OrderDetail,
  type OrderRow,
  type ReminderDraft,
} from '@ananda-agents/shared';
import { InjectDb, type Db } from '../db/db.module';
import { customers, orderLines, orders, paymentReminders, requests, users } from '../db/schema';
import { decrypt } from '../core/crypto';
import { AuditService } from '../core/audit.service';
import { MailService } from '../core/mail.service';
import type { AuthUser } from '../core/context';
import { CustomersService } from '../customers/customers.service';
import { ProformaService } from './proforma.service';
import { reminderDraft } from './emails';
import { dueThisWeek, isUnpaid, loadOrderRows, toRow, type OrderRecord } from './order-rows';

@Injectable()
export class OrdersService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly customers: CustomersService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly proforma: ProformaService,
  ) {}

  list(user: AuthUser) {
    return loadOrderRows(this.db, eq(orders.agentId, user.id));
  }

  private async own(user: AuthUser, id: string): Promise<OrderRecord> {
    const [o] = await this.db.select().from(orders).where(eq(orders.id, id));
    if (!o) throw new NotFoundException();
    if (user.role !== 'admin' && o.agentId !== user.id) throw new ForbiddenException();
    return o;
  }

  async detail(user: AuthUser, id: string): Promise<OrderDetail> {
    const o = await this.own(user, id);
    const [row] = await loadOrderRows(this.db, eq(orders.id, id));
    const [c] = await this.db.select().from(customers).where(eq(customers.id, o.customerId));
    const [agent] = await this.db.select({ name: users.name }).from(users).where(eq(users.id, o.agentId));
    const lines = await this.db.select().from(orderLines).where(eq(orderLines.orderId, id));
    const corrections = await this.db
      .select()
      .from(requests)
      .where(and(eq(requests.type, 'correction'), eq(requests.orderId, id)))
      .orderBy(desc(requests.createdAt));
    const at = (d: Date | null) => d?.toISOString() ?? null;
    return {
      ...row,
      agentName: agent.name,
      customer: { name: c.name, phone: decrypt(c.phoneEnc), email: decrypt(c.emailEnc), country: c.country, address: c.billingAddress },
      deliveryAddress: o.deliveryAddress,
      deliveryInstructions: o.deliveryInstructions,
      language: o.language,
      validUntil: o.validUntil,
      holdUntil: o.holdUntil,
      lines: lines.map(({ flavour, cartons, units, unitPriceCents, lineNetCents }) => ({ flavour, cartons, units, unitPriceCents, lineNetCents })),
      netCents: o.netCents,
      vatCents: o.vatCents,
      vatRateBp: o.vatRateBp,
      reverseCharge: o.vatRateBp === 0,
      unitPriceCents: o.unitPriceCents,
      discounted: o.unitPriceCents < o.tierUnitPriceCents,
      steps: [
        { key: 'sent', at: at(o.issuedAt) },
        { key: 'paid', at: at(o.paidAt) },
        { key: 'warehouse', at: at(o.sentToWarehouseAt) },
        { key: 'delivered', at: at(o.deliveredAt) },
        { key: 'invoiced', at: at(o.invoicedAt) },
      ],
      corrections: corrections.map((r) => ({ id: r.id, note: r.note ?? '', status: r.status, decisionNote: r.decisionNote, createdAt: r.createdAt.toISOString() })),
      cancelledAt: at(o.cancelledAt),
      emailFailed: !!o.emailError,
    };
  }

  async pdf(user: AuthUser, id: string): Promise<{ number: string; pdf: Buffer }> {
    const order = await this.own(user, id);
    const lines = await this.db.select().from(orderLines).where(eq(orderLines.orderId, id));
    const [agent] = await this.db.select({ name: users.name, email: users.email, phone: users.phone }).from(users).where(eq(users.id, order.agentId));
    return { number: order.number, pdf: await this.proforma.render({ order, lines, agent }) };
  }

  async requestCorrection(user: AuthUser, id: string, note: string) {
    const o = await this.own(user, id);
    const [r] = await this.db.insert(requests).values({ type: 'correction', agentId: user.id, customerId: o.customerId, orderId: id, note }).returning({ id: requests.id });
    await this.audit.log(user.id, 'correction.request', 'order', id, { requestId: r.id });
    const admins = await this.customers.adminEmails();
    if (admins.length) {
      await this.mail.send({ to: admins, subject: `Correction requested on ${o.number}`, text: `${user.name} asks for a correction on ${o.number} (${o.billTo.name}):\n\n${note}` }).catch(() => undefined);
    }
    return { id: r.id };
  }

  // ---------- Reminders (UC-10) ----------

  private async lastReminder(orderId: string): Promise<Date | null> {
    const [r] = await this.db.select({ at: paymentReminders.sentAt }).from(paymentReminders).where(eq(paymentReminders.orderId, orderId)).orderBy(desc(paymentReminders.sentAt)).limit(1);
    return r?.at ?? null;
  }

  private nextAllowed(last: Date | null): Date | null {
    if (!last) return null;
    const next = new Date(last.getTime() + REMINDER_COOLDOWN_HOURS * 3_600_000);
    return next > new Date() ? next : null;
  }

  async draftReminder(user: AuthUser, id: string): Promise<ReminderDraft> {
    const o = await this.own(user, id);
    if (o.status !== 'waiting_for_payment') throw new ConflictException({ message: 'not_unpaid' });
    const [c] = await this.db.select({ emailEnc: customers.emailEnc }).from(customers).where(eq(customers.id, o.customerId));
    const row = toRow(o, o.billTo.name);
    const draft = reminderDraft(o, o.language, row.daysLate, user.name);
    const admins = await this.customers.adminEmails();
    return { to: decrypt(c.emailEnc), cc: [user.email, ...admins], ...draft, language: o.language, nextAllowedAt: this.nextAllowed(await this.lastReminder(id))?.toISOString() ?? null };
  }

  /** The agent reads and edits the draft; Admins are copied on every reminder; one per order per 24 h. */
  async sendReminder(user: AuthUser, id: string, subject: string, body: string) {
    const o = await this.own(user, id);
    if (o.status !== 'waiting_for_payment') throw new ConflictException({ message: 'not_unpaid' });
    if (this.nextAllowed(await this.lastReminder(id))) throw new HttpException({ message: 'reminder_cooldown' }, HttpStatus.TOO_MANY_REQUESTS);
    const [c] = await this.db.select({ emailEnc: customers.emailEnc }).from(customers).where(eq(customers.id, o.customerId));
    const to = decrypt(c.emailEnc);
    if (!to) throw new ConflictException({ message: 'no_customer_email' });
    const cc = [user.email, ...(await this.customers.adminEmails())];
    const { pdf, number } = await this.pdf(user, id);
    await this.mail.send({ to, cc, replyTo: user.email, subject, text: body, attachments: [{ filename: `${number}.pdf`, content: pdf, contentType: 'application/pdf' }] });
    await this.db.transaction(async (tx) => {
      await tx.insert(paymentReminders).values({ orderId: id, agentId: user.id, toEmail: to, cc: cc.join(', '), subject, body });
      await this.audit.log(user.id, 'reminder.send', 'order', id, { to, cc }, tx);
    });
    return { sentAt: new Date().toISOString() };
  }

  // ---------- Collections (UC-10) and Earnings (UC-11) ----------

  async collections(user: AuthUser): Promise<Collections> {
    const rows = await this.list(user);
    const late = rows.filter((r) => r.status === 'late').sort((a, b) => b.daysLate - a.daysLate || b.totalCents - a.totalCents);
    const dueSoon = rows.filter((r) => dueThisWeek(r)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const unpaidIds = rows.filter(isUnpaid).map((r) => r.id);
    const since = new Date(Date.now() - 30 * 86_400_000);
    const sent = unpaidIds.length
      ? await this.db.select({ id: paymentReminders.id }).from(paymentReminders).where(and(eq(paymentReminders.agentId, user.id), gte(paymentReminders.sentAt, since), inArray(paymentReminders.orderId, unpaidIds)))
      : [];
    // Call and E-mail sit next to every late payer (#20), so these rows carry the decrypted contact.
    const ids = [...new Set([...late, ...dueSoon].map((r) => r.customerId))];
    const contacts = ids.length ? await this.db.select({ id: customers.id, phoneEnc: customers.phoneEnc, emailEnc: customers.emailEnc }).from(customers).where(inArray(customers.id, ids)) : [];
    const byId = new Map(contacts.map((c) => [c.id, { phone: decrypt(c.phoneEnc), email: decrypt(c.emailEnc) }]));
    const withContact = (r: OrderRow) => ({ ...r, ...(byId.get(r.customerId) ?? { phone: null, email: null }) });
    return {
      kpi: {
        lateCents: late.reduce((s, r) => s + r.totalCents, 0),
        lateCustomers: new Set(late.map((r) => r.customerId)).size,
        dueThisWeekCents: dueSoon.reduce((s, r) => s + r.totalCents, 0),
        remindersSent: sent.length,
      },
      late: late.map(withContact),
      dueSoon: dueSoon.map(withContact),
    };
  }

  async earnings(user: AuthUser): Promise<Earnings> {
    const rows = (await this.list(user)).filter((r) => r.commissionStatus !== 'none');
    const thisMonth = isoDate(new Date()).slice(0, 7);
    const paid = rows.filter((r) => r.commissionStatus === 'paid' && r.closedAt);
    const paidIn = (prefix: string) => paid.filter((r) => isoDate(r.closedAt!).startsWith(prefix)).reduce((s, r) => s + r.commission.grossCents, 0);
    return {
      comingCents: rows.filter((r) => r.commissionStatus === 'coming').reduce((s, r) => s + r.commission.grossCents, 0),
      paidThisMonthCents: paidIn(thisMonth),
      paidThisYearCents: paidIn(thisMonth.slice(0, 4)),
      // Coming first (#14), then paid, newest first.
      orders: [...rows.filter((r) => r.commissionStatus === 'coming'), ...rows.filter((r) => r.commissionStatus === 'paid')],
    };
  }
}
