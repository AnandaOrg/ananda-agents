import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Inject } from '@nestjs/common';
import { and, desc, eq, inArray, max, ne, notInArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { decisionSchema, ORDER_STATUSES, type OrderStatus } from '@ananda-agents/shared';
import { InjectDb, type Db } from '../db/db.module';
import { customers, orders, requests, users } from '../db/schema';
import { decrypt } from '../core/crypto';
import { AuditService } from '../core/audit.service';
import { NotifyService } from '../core/notify.service';
import { CurrentUser, Roles, type AuthUser } from '../core/context';
import { ZodPipe } from '../core/zod.pipe';

// The Admin steps the agent app depends on (approve, confirm payment, deliver, invoice). The real
// back office is the ANANDA Admin app; this keeps Journey 1 testable end to end in this repo.

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  waiting_for_payment: 'paid',
  paid: 'sent_to_warehouse',
  sent_to_warehouse: 'delivered',
  delivered: 'invoice_issued',
};
const STAMP = { paid: 'paidAt', sent_to_warehouse: 'sentToWarehouseAt', delivered: 'deliveredAt', invoice_issued: 'invoicedAt', cancelled: 'cancelledAt' } as const;

@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotifyService) private readonly notify: NotifyService,
  ) {}

  @Get('queue')
  async queue() {
    const agent = alias(users, 'agent');
    const pendingCustomers = await this.db
      .select({ c: customers, agentName: agent.name })
      .from(customers)
      .leftJoin(agent, eq(agent.id, customers.ownerAgentId))
      .where(eq(customers.status, 'waiting_for_approval'))
      .orderBy(customers.createdAt);
    const pendingRequests = await this.db
      .select({ r: requests, agentName: agent.name, customerName: customers.name, orderNumber: orders.number })
      .from(requests)
      .innerJoin(agent, eq(agent.id, requests.agentId))
      .leftJoin(customers, eq(customers.id, requests.customerId))
      .leftJoin(orders, eq(orders.id, requests.orderId))
      .where(eq(requests.status, 'pending'))
      .orderBy(requests.createdAt);
    const openOrders = await this.db
      .select({ o: orders, agentName: agent.name })
      .from(orders)
      .innerJoin(agent, eq(agent.id, orders.agentId))
      .where(notInArray(orders.status, ['invoice_issued', 'cancelled']))
      .orderBy(desc(orders.issuedAt));
    return {
      customers: pendingCustomers.map(({ c, agentName }) => ({
        id: c.id,
        number: c.number,
        name: c.name,
        vatNumber: c.vatNumber,
        country: c.country,
        address: c.billingAddress,
        contactName: decrypt(c.contactNameEnc),
        email: decrypt(c.emailEnc),
        phone: decrypt(c.phoneEnc),
        needsReview: c.needsReview,
        agentName,
        createdAt: c.createdAt,
      })),
      requests: pendingRequests.map(({ r, agentName, customerName, orderNumber }) => ({
        id: r.id,
        type: r.type,
        agentName,
        customerName,
        orderNumber,
        note: r.note,
        targetUnitPriceCents: r.targetUnitPriceCents,
        createdAt: r.createdAt,
      })),
      orders: openOrders.map(({ o, agentName }) => ({
        id: o.id,
        number: o.number,
        customerName: o.billTo.name,
        agentName,
        status: o.status,
        totalCents: o.totalCents,
        dueDate: o.dueDate,
        next: NEXT[o.status] ?? null,
      })),
    };
  }

  @Post('customers/:id/approve')
  async approve(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: { paymentTermsDays?: number }) {
    const c = await this.pendingCustomer(id);
    const terms = Math.max(0, Math.min(90, Math.floor(Number(body?.paymentTermsDays ?? 0)) || 0));
    await this.db.transaction(async (tx) => {
      await tx.update(customers).set({ status: 'active', approvedAt: new Date(), needsReview: false, paymentTermsDays: terms }).where(eq(customers.id, id));
      await this.audit.log(admin.id, 'customer.approve', 'customer', id, { paymentTermsDays: terms }, tx);
      // The approval notification is a Journey 1 step: it opens New sale for this customer.
      if (c.ownerAgentId) await this.notify.notify(c.ownerAgentId, 'customer_approved', { customer: c.name }, `/sales/new?customer=${id}`, tx);
    });
    return { ok: true };
  }

  @Post('customers/:id/reject')
  async reject(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(decisionSchema)) body: { note?: string }) {
    const c = await this.pendingCustomer(id);
    await this.db.transaction(async (tx) => {
      await tx.update(customers).set({ status: 'rejected', rejectedReason: body.note || null }).where(eq(customers.id, id));
      await this.audit.log(admin.id, 'customer.reject', 'customer', id, { note: body.note }, tx);
      if (c.ownerAgentId) await this.notify.notify(c.ownerAgentId, 'customer_rejected', { customer: c.name, reason: body.note ?? '' }, `/customers/${id}`, tx);
    });
    return { ok: true };
  }

  private async pendingCustomer(id: string) {
    const [c] = await this.db.select().from(customers).where(eq(customers.id, id));
    if (!c) throw new NotFoundException();
    if (c.status !== 'waiting_for_approval') throw new ConflictException({ message: 'not_pending' });
    return c;
  }

  @Post('requests/:id/:decision')
  async decide(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('decision') decision: string,
    @Body(new ZodPipe(decisionSchema)) body: { note?: string },
  ) {
    if (decision !== 'approve' && decision !== 'decline') throw new BadRequestException();
    const approved = decision === 'approve';
    const [r] = await this.db.select().from(requests).where(eq(requests.id, id));
    if (!r) throw new NotFoundException();
    if (r.status !== 'pending') throw new ConflictException({ message: 'not_pending' });
    const [c] = r.customerId ? await this.db.select().from(customers).where(eq(customers.id, r.customerId)) : [];
    const [o] = r.orderId ? await this.db.select().from(orders).where(eq(orders.id, r.orderId)) : [];

    await this.db.transaction(async (tx) => {
      await tx
        .update(requests)
        .set({ status: approved ? 'approved' : 'declined', decisionNote: body.note || null, decidedBy: admin.id, decidedAt: new Date() })
        .where(eq(requests.id, id));
      const note = body.note ?? '';
      if (r.type === 'take_over') {
        if (approved) await tx.update(customers).set({ ownerAgentId: r.agentId, ownedSince: new Date() }).where(eq(customers.id, c.id));
        await this.audit.log(admin.id, approved ? 'customer.take_over_approve' : 'customer.take_over_decline', 'customer', c.id, { requestId: id, from: c.ownerAgentId, to: r.agentId }, tx);
        await this.notify.notify(r.agentId, approved ? 'take_over_approved' : 'take_over_declined', { customer: c.name, note }, approved ? `/customers/${c.id}` : `/customers?q=${encodeURIComponent(c.vatNumber)}`, tx);
      } else if (r.type === 'price') {
        await this.audit.log(admin.id, approved ? 'price.approve' : 'price.decline', 'customer', c.id, { requestId: id, targetUnitPriceCents: r.targetUnitPriceCents }, tx);
        await this.notify.notify(
          r.agentId,
          approved ? 'price_approved' : 'price_declined',
          { customer: c.name, price: String(r.targetUnitPriceCents), note },
          `/sales/new?customer=${c.id}`,
          tx,
        );
      } else {
        await this.audit.log(admin.id, 'correction.resolve', 'order', o.id, { requestId: id, approved }, tx);
        await this.notify.notify(r.agentId, 'correction_resolved', { number: o.number, note }, `/orders/${o.id}`, tx);
      }
    });
    return { ok: true };
  }

  @Post('orders/:id/status/:to')
  async advance(@CurrentUser() admin: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('to') to: string) {
    if (!(ORDER_STATUSES as readonly string[]).includes(to) || to === 'waiting_for_payment') throw new BadRequestException();
    const target = to as Exclude<OrderStatus, 'waiting_for_payment'>;
    const [o] = await this.db.select().from(orders).where(eq(orders.id, id));
    if (!o) throw new NotFoundException();
    const allowed = target === 'cancelled' ? o.status === 'waiting_for_payment' : NEXT[o.status] === target;
    if (!allowed) throw new ConflictException({ message: 'bad_transition', from: o.status, to: target });

    await this.db.transaction(async (tx) => {
      await tx.update(orders).set({ status: target, [STAMP[target]]: new Date() }).where(eq(orders.id, id));
      if (target === 'cancelled') {
        // A cancelled order does not count as the customer's last order (open question; see README).
        const [{ last }] = await tx
          .select({ last: max(orders.issuedAt) })
          .from(orders)
          .where(and(eq(orders.customerId, o.customerId), ne(orders.status, 'cancelled')));
        await tx.update(customers).set({ lastOrderAt: last ?? null }).where(eq(customers.id, o.customerId));
      }
      await this.audit.log(admin.id, 'order.status', 'order', id, { from: o.status, to: target }, tx);
      const link = `/orders/${id}`;
      const params = { number: o.number, customer: o.billTo.name };
      if (target === 'paid') await this.notify.notify(o.agentId, 'order_paid', params, link, tx);
      if (target === 'delivered') await this.notify.notify(o.agentId, 'order_delivered', params, link, tx);
      if (target === 'invoice_issued') {
        const gross = Math.round(o.commissionCents * 1.2);
        await this.notify.notify(o.agentId, 'commission_paid', { ...params, amount: String(gross) }, link, tx);
      }
    });
    return { ok: true };
  }

  @Get('agents')
  agents() {
    return this.db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.role, ['agent']));
  }
}
