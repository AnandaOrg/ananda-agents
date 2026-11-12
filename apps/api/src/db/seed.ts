/* Demo data for the PRD's cast (Ivan Petrov, Sofia Rooftop Bar, Hotel Marinela Group, Minimart …).
 * Every amount comes from the shared calculation, so lists, PDFs and commission agree.
 * Run with `pnpm db:reset` (empties the database first) or `pnpm db:seed` on an empty one. */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import {
  PROFORMA_VALIDITY_DAYS,
  STOCK_HOLD_DAYS,
  addDays,
  calculateOrder,
  dueDateFor,
  isoDate,
  type CartonsByFlavour,
} from '@ananda-agents/shared';
import * as s from './schema';
import { encrypt } from '../core/crypto';

export const DEMO_PASSWORD = 'ananda-demo-2026';
// A public deployment must not use the password printed in this repo: set SEED_PASSWORD there.
const PASSWORD = process.env.SEED_PASSWORD || DEMO_PASSWORD;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema: s });
  const [{ n }] = (await db.execute<{ n: number }>(sql`select count(*)::int as n from users`)).rows;
  if (n > 0) {
    console.log('Database already has data. Run `pnpm db:reset` for a fresh start.');
    await pool.end();
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  const [ivan, maria, admin] = await db
    .insert(s.users)
    .values([
      { email: 'ivan@ananda.test', passwordHash: hash, name: 'Ivan Petrov', role: 'agent', phone: '+359 888 123 456' },
      { email: 'maria@ananda.test', passwordHash: hash, name: 'Maria Georgieva', role: 'agent', phone: '+359 887 654 321' },
      { email: 'admin@ananda.test', passwordHash: hash, name: 'ANANDA Office', role: 'admin' },
    ])
    .returning();

  type C = { key: string; vat: string; name: string; country: string; address: string; contact: string; phone: string; email: string; owner: string | null; status?: 'waiting_for_approval' | 'active'; terms?: number; createdDaysAgo: number };
  const cs: C[] = [
    { key: 'rooftop', vat: 'BG131568423', name: 'Sofia Rooftop Bar', country: 'BG', address: 'ul. Graf Ignatiev 12, 1000 Sofia', contact: 'Georgi Dimitrov', phone: '+359 888 410 220', email: 'georgi@rooftop.test', owner: ivan.id, terms: 30, createdDaysAgo: 120 },
    { key: 'minimart', vat: 'BG204877612', name: 'Minimart', country: 'BG', address: 'bul. Vitosha 88, 1463 Sofia', contact: 'Petya Ivanova', phone: '+359 878 300 112', email: 'orders@minimart.test', owner: ivan.id, createdDaysAgo: 90 },
    { key: 'athens', vat: 'EL094518726', name: 'Café Athens', country: 'GR', address: 'Ermou 54, 10563 Athina', contact: 'Nikos Papadopoulos', phone: '+30 210 555 0199', email: 'nikos@cafeathens.test', owner: ivan.id, createdDaysAgo: 30 },
    { key: 'lisboa', vat: 'PT513402987', name: 'Bar Lisboa', country: 'PT', address: 'Rua Augusta 210, 1100-053 Lisboa', contact: 'Ana Costa', phone: '+351 21 555 0144', email: 'ana@barlisboa.test', owner: ivan.id, createdDaysAgo: 14 },
    { key: 'seagarden', vat: 'BG206330419', name: 'Sea Garden Bistro', country: 'BG', address: 'Primorski park, 9000 Varna', contact: 'Stefan Kolev', phone: '+359 899 220 330', email: 'stefan@seagarden.test', owner: ivan.id, createdDaysAgo: 3 },
    { key: 'marinela', vat: 'BG131272445', name: 'Hotel Marinela Group', country: 'BG', address: 'bul. James Bourchier 100, 1407 Sofia', contact: 'Daniela Hristova', phone: '+359 2 969 2222', email: 'fnb@marinela.test', owner: ivan.id, status: 'waiting_for_approval', createdDaysAgo: 1 },
    { key: 'wine', vat: 'BG115620839', name: 'Plovdiv Wine House', country: 'BG', address: 'ul. Saborna 22, 4000 Plovdiv', contact: 'Krasimir Todorov', phone: '+359 32 555 100', email: 'krasi@winehouse.test', owner: maria.id, createdDaysAgo: 200 },
    { key: 'varna', vat: 'BG103562271', name: 'Varna Beach Club', country: 'BG', address: 'Kraybrezhna aleya 5, 9000 Varna', contact: 'Iva Marinova', phone: '+359 52 555 300', email: 'iva@beachclub.test', owner: maria.id, createdDaysAgo: 300 },
  ];
  const ids: Record<string, s.CustomerId> = {};
  let custNo = 0;
  for (const c of cs) {
    custNo++;
    const [row] = await db
      .insert(s.customers)
      .values({
        number: `C-${String(custNo).padStart(4, '0')}`,
        vatNumber: c.vat,
        name: c.name,
        country: c.country,
        billingAddress: c.address,
        contactNameEnc: encrypt(c.contact),
        phoneEnc: encrypt(c.phone),
        emailEnc: encrypt(c.email),
        status: c.status ?? 'active',
        paymentTermsDays: c.terms ?? 0,
        ownerAgentId: c.owner,
        ownedSince: daysAgo(c.createdDaysAgo),
        createdBy: c.owner,
        approvedAt: c.status === 'waiting_for_approval' ? null : daysAgo(c.createdDaysAgo - 1),
        createdAt: daysAgo(c.createdDaysAgo),
      })
      .returning({ id: s.customers.id });
    ids[c.key] = row.id;
    await db.insert(s.viesCache).values({ vatNumber: c.vat, valid: true, name: c.name.toUpperCase(), address: c.address, country: c.country });
  }
  // A business that is in the EU register but not yet an ANANDA customer (Journey 1 starts here).
  await db.insert(s.viesCache).values({ vatNumber: 'BG203145882', valid: true, name: 'VITOSHA GARDEN RESTAURANT OOD', address: 'ul. Cherni vrah 47, 1407 Sofia', country: 'BG' });

  type O = { customer: string; agent: typeof ivan; daysAgo: number; cartons: CartonsByFlavour; status: s.OrderStatusValue; lang?: 'en' | 'bg'; steps?: Partial<Record<'paid' | 'warehouse' | 'delivered' | 'invoiced' | 'cancelled', number>> };
  const os: O[] = [
    { customer: 'varna', agent: maria, daysAgo: 245, cartons: { aloha: 10, gaia: 10, santorini: 10 }, status: 'invoice_issued', steps: { paid: 240, warehouse: 239, delivered: 236, invoiced: 235 } },
    { customer: 'rooftop', agent: ivan, daysAgo: 95, cartons: { aloha: 10, gaia: 10, santorini: 10, kyoto: 10 }, status: 'invoice_issued', lang: 'bg', steps: { paid: 70, warehouse: 69, delivered: 66, invoiced: 64 } },
    { customer: 'minimart', agent: ivan, daysAgo: 60, cartons: { aloha: 5, gaia: 5, kyoto: 5 }, status: 'invoice_issued', steps: { paid: 55, warehouse: 54, delivered: 50, invoiced: 5 } },
    { customer: 'wine', agent: maria, daysAgo: 40, cartons: { santorini: 15, kyoto: 10 }, status: 'delivered', steps: { paid: 36, warehouse: 35, delivered: 32 } },
    { customer: 'minimart', agent: ivan, daysAgo: 39, cartons: { aloha: 6, gaia: 6 }, status: 'cancelled', steps: { cancelled: 37 } },
    { customer: 'rooftop', agent: ivan, daysAgo: 38, cartons: { aloha: 10, gaia: 10, santorini: 10, kyoto: 10 }, status: 'waiting_for_payment', lang: 'bg' },
    { customer: 'minimart', agent: ivan, daysAgo: 20, cartons: { aloha: 4, gaia: 4, kyoto: 4 }, status: 'sent_to_warehouse', steps: { paid: 15, warehouse: 14 } },
    { customer: 'athens', agent: ivan, daysAgo: 10, cartons: { aloha: 8, santorini: 12 }, status: 'waiting_for_payment' },
    { customer: 'lisboa', agent: ivan, daysAgo: 2, cartons: { gaia: 5, kyoto: 5 }, status: 'waiting_for_payment' },
  ];
  let orderNo = 0;
  const orderIds: string[] = [];
  for (const o of os) {
    orderNo++;
    const c = cs.find((x) => x.key === o.customer)!;
    const issued = daysAgo(o.daysAgo);
    const calc = calculateOrder(o.cartons, c.country);
    const at = (k: keyof NonNullable<O['steps']>) => (o.steps?.[k] != null ? daysAgo(o.steps[k]!) : null);
    const [row] = await db
      .insert(s.orders)
      .values({
        number: `S-${String(orderNo).padStart(4, '0')}`,
        customerId: ids[o.customer],
        agentId: o.agent.id,
        status: o.status,
        language: o.lang ?? 'en',
        totalCartons: calc.totalCartons,
        totalUnits: calc.totalUnits,
        tierUnitPriceCents: calc.tierUnitPriceCents,
        unitPriceCents: calc.unitPriceCents,
        netCents: calc.netCents,
        vatRateBp: calc.vatRateBp,
        vatCents: calc.vatCents,
        totalCents: calc.totalCents,
        commissionCents: calc.commission.netCents,
        billTo: { name: c.name, vatNumber: c.vat, country: c.country, address: c.address, customerNumber: `C-${String(cs.indexOf(c) + 1).padStart(4, '0')}` },
        deliveryAddress: c.address,
        paymentTermsDays: c.terms ?? 0,
        issuedAt: issued,
        validUntil: isoDate(addDays(issued, PROFORMA_VALIDITY_DAYS)),
        dueDate: dueDateFor(issued, c.terms ?? 0),
        holdUntil: isoDate(addDays(issued, STOCK_HOLD_DAYS)),
        paidAt: at('paid'),
        sentToWarehouseAt: at('warehouse'),
        deliveredAt: at('delivered'),
        invoicedAt: at('invoiced'),
        cancelledAt: at('cancelled'),
        emailedTo: c.email,
        idempotencyKey: crypto.randomUUID(),
        createdAt: issued,
      })
      .returning({ id: s.orders.id });
    orderIds.push(row.id);
    await db.insert(s.orderLines).values(calc.lines.map((l) => ({ orderId: row.id, ...l })));
  }
  // Last order per customer, ignoring cancelled ones.
  await db.execute(sql`
    UPDATE customers c SET last_order_at = sub.last
    FROM (SELECT customer_id, max(issued_at) AS last FROM orders WHERE status <> 'cancelled' GROUP BY customer_id) sub
    WHERE sub.customer_id = c.id`);

  // Sofia Rooftop Bar was already reminded once.
  await db.insert(s.paymentReminders).values({
    orderId: orderIds[5],
    agentId: ivan.id,
    toEmail: 'georgi@rooftop.test',
    cc: 'ivan@ananda.test, admin@ananda.test',
    subject: 'Напомняне: проформа S-0006',
    body: '…',
    sentAt: daysAgo(2),
  });

  await db.insert(s.notifications).values([
    { userId: ivan.id, type: 'order_paid', params: { number: 'S-0007', customer: 'Minimart' }, link: `/orders/${orderIds[6]}`, createdAt: daysAgo(15) },
    { userId: ivan.id, type: 'customer_approved', params: { customer: 'Sea Garden Bistro' }, link: `/sales/new?customer=${ids.seagarden}`, createdAt: daysAgo(2) },
  ]);

  await db.insert(s.numberSequences).values([
    { key: 'order', next: orderNo + 1 },
    { key: 'customer', next: custNo + 1 },
  ]);
  void admin;
  console.log(`Demo data loaded. Sign in as ivan@ananda.test (agent) or admin@ananda.test (admin), password ${process.env.SEED_PASSWORD ? '(SEED_PASSWORD)' : DEMO_PASSWORD}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
