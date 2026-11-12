import { desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { commissionBreakdown, daysBetween, isoDate, type OrderRow } from '@ananda-agents/shared';
import type { DbOrTx } from '../db/db.module';
import { customers, orders, paymentReminders } from '../db/schema';

export type OrderRecord = typeof orders.$inferSelect;

export const today = () => isoDate(new Date());

/** Stored status → what the agent sees (unpaid past due → "N days late"), plus commission state. */
export function toRow(o: OrderRecord, customerName: string, reminders = 0, lastReminderAt: Date | null = null, now = today()): OrderRow {
  const late = o.status === 'waiting_for_payment' && o.dueDate < now;
  return {
    id: o.id,
    number: o.number,
    customerId: o.customerId,
    customerName,
    orderedAt: o.issuedAt.toISOString(),
    units: o.totalUnits,
    cartons: o.totalCartons,
    totalCents: o.totalCents,
    status: late ? 'late' : o.status,
    daysLate: late ? daysBetween(o.dueDate, now) : 0,
    dueDate: o.dueDate,
    commission: commissionBreakdown(o.status === 'cancelled' ? 0 : o.commissionCents),
    commissionStatus: o.status === 'cancelled' ? 'none' : o.status === 'invoice_issued' ? 'paid' : 'coming',
    paidAt: o.paidAt?.toISOString() ?? null,
    closedAt: o.status === 'invoice_issued' ? (o.invoicedAt?.toISOString() ?? null) : null,
    reminders,
    lastReminderAt: lastReminderAt?.toISOString() ?? null,
  };
}

export async function loadOrderRows(db: DbOrTx, where: SQL | undefined): Promise<OrderRow[]> {
  const rows = await db
    .select({ o: orders, customerName: customers.name })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(where)
    .orderBy(desc(orders.issuedAt));
  if (!rows.length) return [];
  const counts = await db
    .select({ orderId: paymentReminders.orderId, n: sql<number>`count(*)::int`, last: sql<Date>`max(${paymentReminders.sentAt})` })
    .from(paymentReminders)
    .where(inArray(paymentReminders.orderId, rows.map((r) => r.o.id)))
    .groupBy(paymentReminders.orderId);
  const byOrder = new Map(counts.map((c) => [c.orderId, c]));
  const now = today();
  return rows.map((r) => {
    const c = byOrder.get(r.o.id);
    return toRow(r.o, r.customerName, c?.n ?? 0, c?.last ? new Date(c.last) : null, now);
  });
}

export const isUnpaid = (r: OrderRow) => r.status === 'waiting_for_payment' || r.status === 'late';

/** Unpaid, not late, due within the next 7 days. */
export function dueThisWeek(r: OrderRow, now = today()): boolean {
  return r.status === 'waiting_for_payment' && daysBetween(now, r.dueDate) <= 7;
}
