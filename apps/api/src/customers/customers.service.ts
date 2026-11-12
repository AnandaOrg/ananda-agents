import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Inject } from '@nestjs/common';
import { and, desc, eq, ilike, isNull, or } from 'drizzle-orm';
import {
  isReverseCharge,
  isoDate,
  ownedUntil,
  ownershipState,
  parseVat,
  type AnandaMatch,
  type CustomerChip,
  type CustomerDetail,
  type CustomerRow,
  type CustomersOverview,
  type NewCustomerInput,
  type OrderRow,
  type SearchResult,
} from '@ananda-agents/shared';
import { InjectDb, type Db } from '../db/db.module';
import { customers, freeReminders, orders, requests, users } from '../db/schema';
import { decrypt, encrypt } from '../core/crypto';
import { AuditService } from '../core/audit.service';
import { MailService } from '../core/mail.service';
import { NumberingService } from '../core/numbering.service';
import type { AuthUser } from '../core/context';
import { dueThisWeek, isUnpaid, loadOrderRows } from '../orders/order-rows';
import { ViesService } from './vies.service';

type CustomerRecord = typeof customers.$inferSelect;

@Injectable()
export class CustomersService {
  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(ViesService) private readonly vies: ViesService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(NumberingService) private readonly numbering: NumberingService,
  ) {}

  // ---------- Lists ----------

  private toRow(c: CustomerRecord, own: OrderRow[]): CustomerRow {
    const live = own.filter((o) => o.status !== 'cancelled');
    const last = live[0] ?? null;
    const unpaid = own.filter(isUnpaid);
    const late = unpaid.filter((o) => o.status === 'late');
    const chip: CustomerChip =
      c.status === 'rejected'
        ? { kind: 'rejected' }
        : c.status === 'waiting_for_approval'
          ? { kind: 'waiting_for_approval' }
          : late.length
            ? { kind: 'late', days: Math.max(...late.map((o) => o.daysLate)) }
            : unpaid.length
              ? { kind: 'owes' }
              : live.length
                ? { kind: 'paid_up' }
                : { kind: 'new' };
    return {
      id: c.id,
      number: c.number,
      name: c.name,
      vatNumber: c.vatNumber,
      country: c.country,
      lastOrder: last ? { number: last.number, date: last.orderedAt } : null,
      owesCents: unpaid.reduce((s, o) => s + o.totalCents, 0),
      lateCents: late.reduce((s, o) => s + o.totalCents, 0),
      chip,
    };
  }

  async overview(user: AuthUser): Promise<CustomersOverview> {
    const list = await this.db.select().from(customers).where(eq(customers.ownerAgentId, user.id)).orderBy(customers.name);
    const rows = await loadOrderRows(this.db, eq(orders.agentId, user.id));
    const byCustomer = Map.groupBy(rows, (r) => r.customerId);
    const result = list.map((c) => this.toRow(c, byCustomer.get(c.id) ?? []));
    // Late payers first, then waiting for approval, then by name.
    const rank = (r: CustomerRow) => (r.chip.kind === 'late' ? 0 : r.chip.kind === 'waiting_for_approval' ? 1 : 2);
    result.sort((a, b) => rank(a) - rank(b) || b.lateCents - a.lateCents || a.name.localeCompare(b.name));
    const unpaid = rows.filter(isUnpaid);
    const late = unpaid.filter((o) => o.status === 'late');
    return {
      customers: result,
      kpi: {
        lateCents: late.reduce((s, o) => s + o.totalCents, 0),
        lateCustomers: new Set(late.map((o) => o.customerId)).size,
        dueThisWeekCents: unpaid.filter((o) => dueThisWeek(o)).reduce((s, o) => s + o.totalCents, 0),
        unpaidCents: unpaid.reduce((s, o) => s + o.totalCents, 0),
      },
    };
  }

  // ---------- Search (UC-01) ----------

  async search(user: AuthUser, q: string): Promise<SearchResult> {
    const term = q.trim();
    if (term.length < 2) return { customers: [], vat: null };
    const vat = parseVat(term);
    const like = `%${term.replace(/[%_]/g, '')}%`;
    const own = await this.db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.ownerAgentId, user.id),
          or(ilike(customers.name, like), ilike(customers.vatNumber, `%${(vat?.full ?? term).replace(/[%_\s]/g, '')}%`)),
        ),
      )
      .orderBy(customers.name)
      .limit(20);
    const rows = own.length ? await loadOrderRows(this.db, eq(orders.agentId, user.id)) : [];
    const byCustomer = Map.groupBy(rows, (r) => r.customerId);
    const customerRows = own.map((c) => this.toRow(c, byCustomer.get(c.id) ?? []));
    if (!vat) return { customers: customerRows, vat: null };

    const vies = await this.vies.check(vat);
    return { customers: customerRows, vat: { vies, ananda: await this.match(user, vat.full) } };
  }

  private async match(user: AuthUser, vatNumber: string): Promise<AnandaMatch> {
    const none: AnandaMatch = { state: 'not_customer', customerId: null, customerName: null, agentName: null, lastOrderDate: null, freeFrom: null, takeOverPending: false, remindOn: null };
    const [row] = await this.db
      .select({ c: customers, agentName: users.name })
      .from(customers)
      .leftJoin(users, eq(users.id, customers.ownerAgentId))
      .where(eq(customers.vatNumber, vatNumber));
    if (!row || (row.c.status === 'rejected' && row.c.ownerAgentId !== user.id)) return none;
    const c = row.c;
    const state = ownershipState(user.id, { ...c, pending: c.status === 'waiting_for_approval' });
    const until = ownedUntil(c.lastOrderAt, c.ownedSince);
    const base = { ...none, state, customerId: c.id, customerName: c.name, lastOrderDate: c.lastOrderAt?.toISOString() ?? null };
    if (state !== 'other') return base;
    // Another agent's customer: only their name, last order and free-from date; never deals (FR-04).
    const [pending] = await this.db
      .select({ id: requests.id })
      .from(requests)
      .where(and(eq(requests.type, 'take_over'), eq(requests.status, 'pending'), eq(requests.agentId, user.id), eq(requests.customerId, c.id)));
    const [reminder] = await this.db
      .select({ notifyOn: freeReminders.notifyOn })
      .from(freeReminders)
      .where(and(eq(freeReminders.agentId, user.id), eq(freeReminders.customerId, c.id), isNull(freeReminders.sentAt)));
    return {
      ...base,
      agentName: row.agentName,
      freeFrom: c.status === 'waiting_for_approval' || !until ? null : isoDate(until),
      takeOverPending: !!pending,
      remindOn: reminder?.notifyOn ?? null,
    };
  }

  // ---------- Add (UC-02) ----------

  async create(user: AuthUser, input: NewCustomerInput): Promise<{ id: string; number: string }> {
    const vat = parseVat(input.vatNumber);
    if (!vat) throw new BadRequestException({ message: 'invalid_vat' });
    const [existing] = await this.db.select().from(customers).where(eq(customers.vatNumber, vat.full));
    if (existing && existing.status !== 'rejected') throw new ConflictException({ message: 'already_exists', customerId: existing.id });

    const vies = await this.vies.check(vat);
    let name = vies.status === 'valid' ? vies.name : null;
    let address = vies.status === 'valid' ? vies.address : null;
    const fromRegister = !!(name && address);
    if (!fromRegister) {
      // VIES down, number not in the register, or the member state does not publish names.
      if (!input.manual) throw new BadRequestException({ message: 'manual_required', vies: vies.status });
      name ??= input.manual.name;
      address ??= input.manual.address;
    }
    const country = fromRegister ? vat.country : (input.manual?.country.toUpperCase() ?? vat.country);

    const values = {
      vatNumber: vat.full,
      name: name!,
      country,
      billingAddress: address!,
      deliveryAddress: input.deliveryAddress?.trim() || null,
      contactNameEnc: encrypt(input.contactName),
      phoneEnc: encrypt(input.phone),
      emailEnc: encrypt(input.email),
      status: 'waiting_for_approval' as const,
      source: fromRegister ? ('vies' as const) : ('manual' as const),
      needsReview: !fromRegister,
      rejectedReason: null,
      ownerAgentId: user.id,
      ownedSince: new Date(),
      createdBy: user.id,
    };
    const result = await this.db.transaction(async (tx) => {
      if (existing) {
        await tx.update(customers).set(values).where(eq(customers.id, existing.id));
        return { id: existing.id, number: existing.number ?? (await this.numbering.next(tx, 'customer')) };
      }
      const number = await this.numbering.next(tx, 'customer');
      const [c] = await tx.insert(customers).values({ ...values, number }).returning({ id: customers.id });
      await this.audit.log(user.id, 'customer.create', 'customer', c.id, { vatNumber: vat.full, source: values.source }, tx);
      return { id: c.id, number };
    });
    await this.emailAdmins(`New customer waiting for approval: ${name}`, `${user.name} added ${name} (${vat.full}, ${country}).${values.needsReview ? '\nTyped by hand (not from the EU register): please check the details.' : ''}`);
    return result;
  }

  // ---------- Claim (UC-03) and take-over (UC-04) ----------

  private async get(id: string): Promise<CustomerRecord> {
    const [c] = await this.db.select().from(customers).where(eq(customers.id, id));
    if (!c) throw new NotFoundException();
    return c;
  }

  async claim(user: AuthUser, id: string) {
    const c = await this.get(id);
    if (c.status !== 'active' || ownershipState(user.id, c) !== 'free') throw new ConflictException({ message: 'not_free' });
    await this.db.transaction(async (tx) => {
      await tx.update(customers).set({ ownerAgentId: user.id, ownedSince: new Date() }).where(eq(customers.id, id));
      await this.audit.log(user.id, 'customer.claim', 'customer', id, { previousOwner: c.ownerAgentId }, tx);
    });
    return { id };
  }

  async requestTakeOver(user: AuthUser, id: string, note?: string) {
    const c = await this.get(id);
    if (ownershipState(user.id, { ...c, pending: c.status === 'waiting_for_approval' }) !== 'other') throw new ConflictException({ message: 'not_other' });
    const [dup] = await this.db
      .select({ id: requests.id })
      .from(requests)
      .where(and(eq(requests.type, 'take_over'), eq(requests.status, 'pending'), eq(requests.agentId, user.id), eq(requests.customerId, id)));
    if (dup) return { id: dup.id };
    const [r] = await this.db.insert(requests).values({ type: 'take_over', agentId: user.id, customerId: id, note: note || null }).returning({ id: requests.id });
    await this.audit.log(user.id, 'customer.take_over_request', 'customer', id, { requestId: r.id });
    await this.emailAdmins(`Take-over request: ${c.name}`, `${user.name} asks to take over ${c.name} (${c.vatNumber}).${note ? `\n\n"${note}"` : ''}`);
    return { id: r.id };
  }

  async remindWhenFree(user: AuthUser, id: string) {
    const c = await this.get(id);
    const until = ownedUntil(c.lastOrderAt, c.ownedSince);
    if (!until || ownershipState(user.id, c) !== 'other') throw new ConflictException({ message: 'not_other' });
    const notifyOn = isoDate(until);
    await this.db
      .insert(freeReminders)
      .values({ agentId: user.id, customerId: id, notifyOn })
      .onConflictDoUpdate({ target: [freeReminders.agentId, freeReminders.customerId], set: { notifyOn, sentAt: null } });
    return { notifyOn };
  }

  // ---------- Detail and price requests ----------

  async ownCustomer(user: AuthUser, id: string): Promise<CustomerRecord> {
    const c = await this.get(id);
    if (user.role !== 'admin' && c.ownerAgentId !== user.id) throw new ForbiddenException();
    return c;
  }

  async detail(user: AuthUser, id: string): Promise<CustomerDetail> {
    const c = await this.ownCustomer(user, id);
    const orderRows = await loadOrderRows(this.db, and(eq(orders.customerId, id), eq(orders.agentId, user.id)));
    const priceRequests = await this.db
      .select()
      .from(requests)
      .where(and(eq(requests.type, 'price'), eq(requests.agentId, user.id), eq(requests.customerId, id), isNull(requests.usedByOrderId)))
      .orderBy(desc(requests.createdAt));
    const approved = priceRequests.find((r) => r.status === 'approved');
    const pending = priceRequests.find((r) => r.status === 'pending');
    const until = ownedUntil(c.lastOrderAt, c.ownedSince);
    return {
      id: c.id,
      number: c.number,
      name: c.name,
      vatNumber: c.vatNumber,
      country: c.country,
      billingAddress: c.billingAddress,
      deliveryAddress: c.deliveryAddress,
      contactName: decrypt(c.contactNameEnc),
      phone: decrypt(c.phoneEnc),
      email: decrypt(c.emailEnc),
      status: c.status,
      rejectedReason: c.rejectedReason,
      paymentTermsDays: c.paymentTermsDays,
      reverseCharge: isReverseCharge(c.country),
      ownedUntil: until && c.lastOrderAt ? isoDate(until) : null,
      orders: orderRows,
      approvedPrice: approved ? { unitPriceCents: approved.targetUnitPriceCents!, requestId: approved.id } : null,
      pendingPriceRequest: pending ? { targetUnitPriceCents: pending.targetUnitPriceCents!, createdAt: pending.createdAt.toISOString() } : null,
    };
  }

  async requestPrice(user: AuthUser, id: string, targetUnitPriceCents: number, note?: string) {
    const c = await this.ownCustomer(user, id);
    if (c.status !== 'active') throw new ConflictException({ message: 'not_active' });
    const [r] = await this.db
      .insert(requests)
      .values({ type: 'price', agentId: user.id, customerId: id, targetUnitPriceCents, note: note || null })
      .returning({ id: requests.id });
    await this.audit.log(user.id, 'price.request', 'customer', id, { requestId: r.id, targetUnitPriceCents });
    await this.emailAdmins(`Lower price request: ${c.name}`, `${user.name} asks for €${(targetUnitPriceCents / 100).toFixed(2)} a unit for ${c.name}.${note ? `\n\n"${note}"` : ''}`);
    return { id: r.id };
  }

  async adminEmails(): Promise<string[]> {
    const admins = await this.db.select({ email: users.email }).from(users).where(and(eq(users.role, 'admin'), eq(users.active, true)));
    return admins.map((a) => a.email);
  }

  private async emailAdmins(subject: string, text: string) {
    const to = await this.adminEmails();
    if (!to.length) return;
    // Admin copies are best-effort: a mail outage must not block the agent.
    await this.mail.send({ to, subject, text }).catch(() => undefined);
  }
}
