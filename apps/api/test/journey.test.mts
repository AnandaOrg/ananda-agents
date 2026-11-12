// End-to-end API test of Journey 1 and the follow-up flows, against a running API with fresh demo data:
//   pnpm db:reset && pnpm --filter @ananda-agents/api start   (in another terminal)
//   pnpm --filter @ananda-agents/api test:journey
import { test } from 'node:test';
import assert from 'node:assert/strict';

const API = process.env.API_URL ?? 'http://localhost:4020/api';
const PASSWORD = 'ananda-demo-2026';

async function session(email: string) {
  const res = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  assert.equal(res.status, 200, `login ${email}`);
  const cookie = res.headers.get('set-cookie')!.split(';')[0];
  return async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${API}${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: r.status, body: json, headers: r.headers };
  };
}

test('Journey 1: VAT search → add → approve → sell → proforma sent', async () => {
  const ivan = await session('ivan@ananda.test');
  const admin = await session('admin@ananda.test');

  // UC-01: the VAT is in the register but not an ANANDA customer.
  const search = await ivan('GET', '/customers/search?q=' + encodeURIComponent('bg 203 145 882'));
  assert.equal(search.status, 200);
  assert.equal(search.body.vat.vies.status, 'valid');
  assert.equal(search.body.vat.ananda.state, 'not_customer');

  // UC-02: add from the register; only contact, phone and e-mail are typed.
  const created = await ivan('POST', '/customers', { vatNumber: 'BG203145882', contactName: 'Elena Vasileva', phone: '+359 888 777 666', email: 'elena@vitosha-garden.test' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.match(created.body.number, /^C-\d{4}$/);
  const id = created.body.id;
  const pending = await ivan('GET', `/customers/${id}`);
  assert.equal(pending.body.status, 'waiting_for_approval');
  assert.equal(pending.body.name, 'VITOSHA GARDEN RESTAURANT OOD');

  // A second add of the same VAT is refused.
  const dup = await ivan('POST', '/customers', { vatNumber: 'BG203145882', contactName: 'X', phone: '+359 888 777 666', email: 'x@x.test' });
  assert.equal(dup.status, 409);

  // Selling before approval is refused.
  const early = await ivan('POST', '/sales', { customerId: id, cartons: { aloha: 1 }, language: 'en', idempotencyKey: crypto.randomUUID() });
  assert.equal(early.status, 409);

  // Admin approves → the agent gets a notification that deep-links into New sale.
  assert.equal((await admin('POST', `/admin/customers/${id}/approve`, {})).status, 201);
  const notes = await ivan('GET', '/notifications');
  const approved = notes.body.items.find((n: any) => n.type === 'customer_approved' && n.link === `/sales/new?customer=${id}`);
  assert.ok(approved, 'approval notification with deep link');
  assert.ok(notes.body.unread >= 1);

  // UC-05/06: 12 cartons, the PRD's example; sending twice with the same key makes one proforma.
  const key = crypto.randomUUID();
  const sale = { customerId: id, cartons: { aloha: 4, gaia: 4, kyoto: 4 }, language: 'bg', deliveryInstructions: 'Back entrance, 9–12', idempotencyKey: key };
  const [a, b] = await Promise.all([ivan('POST', '/sales', sale), ivan('POST', '/sales', sale)]);
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.equal(b.status, 201, JSON.stringify(b.body));
  assert.equal(a.body.orderId, b.body.orderId, 'idempotent send');
  assert.equal(a.body.totalCents, 177_984);
  assert.equal(a.body.commission.netCents, 14_400);
  assert.equal(a.body.emailedTo, 'elena@vitosha-garden.test');
  assert.match(a.body.number, /^S-\d{4}$/);

  const order = await ivan('GET', `/orders/${a.body.orderId}`);
  assert.equal(order.body.status, 'waiting_for_payment');
  assert.equal(order.body.commissionStatus, 'coming');
  assert.equal(order.body.vatCents, 29_664);

  const pdf = await fetch(`${API}/orders/${a.body.orderId}/proforma.pdf`, { headers: { cookie: (await loginCookie('ivan@ananda.test')) } });
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF');

  // Lifecycle through the Admin: paid → warehouse → delivered → invoice; commission becomes Paid.
  for (const to of ['paid', 'sent_to_warehouse', 'delivered', 'invoice_issued']) {
    assert.equal((await admin('POST', `/admin/orders/${a.body.orderId}/status/${to}`)).status, 201, to);
  }
  const earnings = await ivan('GET', '/earnings');
  const row = earnings.body.orders.find((o: any) => o.id === a.body.orderId);
  assert.equal(row.commissionStatus, 'paid');
  assert.ok(earnings.body.paidThisMonthCents >= 17_280);
});

async function loginCookie(email: string) {
  const res = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  return res.headers.get('set-cookie')!.split(';')[0];
}

test('ownership: free customer is claimed, another agent\'s stays private', async () => {
  const ivan = await session('ivan@ananda.test');
  const free = await ivan('GET', '/customers/search?q=BG103562271');
  assert.equal(free.body.vat.ananda.state, 'free');
  assert.equal((await ivan('POST', `/customers/${free.body.vat.ananda.customerId}/claim`)).status, 201);
  const mine = await ivan('GET', '/customers/search?q=BG103562271');
  assert.equal(mine.body.vat.ananda.state, 'own');

  const other = await ivan('GET', '/customers/search?q=BG115620839');
  const m = other.body.vat.ananda;
  assert.equal(m.state, 'other');
  assert.equal(m.agentName, 'Maria Georgieva');
  assert.ok(m.freeFrom);
  assert.equal(JSON.stringify(other.body).includes('totalCents'), false, 'no deals exposed');
  assert.equal((await ivan('GET', `/customers/${m.customerId}`)).status, 403);
  assert.equal((await ivan('POST', `/customers/${m.customerId}/claim`)).status, 409);
  assert.equal((await ivan('POST', `/customers/${m.customerId}/take-over`, { note: 'They called me' })).status, 201);
  assert.equal((await ivan('POST', `/customers/${m.customerId}/remind-when-free`)).status, 201);
  const again = await ivan('GET', '/customers/search?q=BG115620839');
  assert.equal(again.body.vat.ananda.takeOverPending, true);
  assert.equal(again.body.vat.ananda.remindOn, m.freeFrom);
});

test('collections: late list, drafted reminder with Admins copied, 24 h cap', async () => {
  const ivan = await session('ivan@ananda.test');
  const col = await ivan('GET', '/collections');
  assert.ok(col.body.late.length >= 2);
  const late = col.body.late.find((o: any) => o.customerName === 'Café Athens');
  assert.ok(late.daysLate >= 1);
  const draft = await ivan('GET', `/orders/${late.id}/reminder-draft`);
  assert.equal(draft.body.to, 'nikos@cafeathens.test');
  assert.ok(draft.body.cc.includes('admin@ananda.test'));
  const sent = await ivan('POST', `/orders/${late.id}/reminders`, { subject: draft.body.subject, body: draft.body.body });
  assert.equal(sent.status, 201);
  const second = await ivan('POST', `/orders/${late.id}/reminders`, { subject: 'x', body: 'y' });
  assert.equal(second.status, 429);
  const after = await ivan('GET', '/collections');
  assert.equal(after.body.late.find((o: any) => o.id === late.id).reminders, 1);
});

test('payment details: invalid IBAN refused, valid one masked with bank and BIC', async () => {
  const ivan = await session('ivan@ananda.test');
  assert.equal((await ivan('GET', '/me')).body.payment.isSet, false);
  const bad = await ivan('PUT', '/me/payment-details', { accountHolder: 'Ivan Petrov', iban: 'BG80 BNBG 9661 1020 3456 79' });
  assert.equal(bad.status, 400);
  const ok = await ivan('PUT', '/me/payment-details', { accountHolder: 'Ivan Petrov', iban: 'BG80 BNBG 9661 1020 3456 78' });
  assert.equal(ok.status, 200);
  const me = (await ivan('GET', '/me')).body;
  assert.equal(me.payment.ibanMasked, 'IBAN ····5678');
  assert.equal(me.payment.bic, 'BNBGBGSD');
  assert.equal(JSON.stringify(me).includes('BNBG96611020345678'), false, 'full IBAN never returned');
});

test('access: agents cannot use admin routes; anonymous gets 401', async () => {
  const ivan = await session('ivan@ananda.test');
  assert.equal((await ivan('GET', '/admin/queue')).status, 403);
  assert.equal((await fetch(`${API}/customers`)).status, 401);
});
