// End-to-end API test of Journey 1 and the follow-up flows, against a running API with fresh demo data:
//   pnpm db:reset && pnpm --filter @ananda-agents/api start   (in another terminal)
//   pnpm --filter @ananda-agents/api test:journey
import { test } from 'node:test';
import assert from 'node:assert/strict';

const API = process.env.API_URL ?? 'http://localhost:4020/api';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8027';
import { createHmac } from 'node:crypto';

// ---------- Authenticator codes (RFC 6238), as an authenticator app computes them ----------
function base32(s: string) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of s.replace(/\s/g, '')) {
    value = (value << 5) | A.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function codeAt(secret: string, step: number) {
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', base32(secret)).update(c).digest();
  return String((mac.readUInt32BE(mac[mac.length - 1] & 15) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
const secrets = new Map<string, string>();
const lastStep = new Map<string, number>();
/** A code the API hasn't seen yet for this person (each code works once; one step of drift is allowed). */
async function freshCode(email: string) {
  for (;;) {
    const now = Math.floor(Date.now() / 30_000);
    const step = Math.max(now, (lastStep.get(email) ?? -1) + 1);
    if (step <= now + 1) { lastStep.set(email, step); return codeAt(secrets.get(email)!, step); }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// ---------- Sign-in: e-mail link (read from Mailpit), then the authenticator code ----------
async function linkToken(email: string, since: number) {
  for (let i = 0; i < 40; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/messages?limit=20`)).json();
    const m = list.messages.find((x: any) => x.To.some((t: any) => t.Address === email) && /sign-in link|връзка за вход|קישור הכניסה/.test(x.Subject) && Date.parse(x.Created) >= since - 1000);
    if (m) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
      return /token=([A-Za-z0-9_-]+)/.exec(full.Text)![1];
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no sign-in e-mail for ${email}`);
}
async function startSignIn(email: string) {
  const since = Date.now();
  const r = await fetch(`${API}/auth/link`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
  assert.equal(r.status, 202, `link ${email}`);
  const v = await fetch(`${API}/auth/link/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: await linkToken(email, since) }) });
  assert.equal(v.status, 200, `verify ${email}`);
  return v.headers.get('set-cookie')!.split(';')[0];
}
const cookies = new Map<string, string>();
const recovery = new Map<string, string[]>();
async function loginCookie(email: string) {
  if (cookies.has(email)) return cookies.get(email)!;
  const cookie = await startSignIn(email);
  const call = (path: string, body?: unknown) =>
    fetch(`${API}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const state = await (await call('/auth/two-step')).json();
  if (!state.on) {
    const setup = await (await call('/auth/two-step/setup', {})).json();
    secrets.set(email, setup.secret.replace(/\s/g, ''));
    const on = await call('/auth/two-step/enable', { code: await freshCode(email) });
    assert.equal(on.status, 200, `enable two-step ${email}`);
    recovery.set(email, (await on.json()).recoveryCodes);
  } else {
    const ok = await call('/auth/two-step/verify', { code: await freshCode(email) });
    assert.equal(ok.status, 200, `two-step ${email}`);
  }
  cookies.set(email, cookie);
  return cookie;
}

async function session(email: string) {
  const cookie = await loginCookie(email);
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
    const body = to === 'paid' ? { code: await freshCode('admin@ananda.test') } : undefined;
    assert.equal((await admin('POST', `/admin/orders/${a.body.orderId}/status/${to}`, body)).status, 201, to);
  }
  const earnings = await ivan('GET', '/earnings');
  const row = earnings.body.orders.find((o: any) => o.id === a.body.orderId);
  assert.equal(row.commissionStatus, 'paid');
  assert.ok(earnings.body.paidThisMonthCents >= 17_280);
});

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

test('sign-in: link once, two steps, recovery code, payment needs the code', async () => {
  // Unknown addresses get the same answer and no e-mail.
  const unknown = await fetch(`${API}/auth/link`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'nobody@ananda.test' }) });
  assert.equal(unknown.status, 202);

  // A link works once.
  const since = Date.now();
  await fetch(`${API}/auth/link`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'maria@ananda.test' }) });
  const token = await linkToken('maria@ananda.test', since);
  const first = await fetch(`${API}/auth/link/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
  assert.equal(first.status, 200);
  const again = await fetch(`${API}/auth/link/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
  assert.equal((await again.json()).message, 'link_used');

  // Half signed in: nothing but the two-step endpoints.
  const cookie = first.headers.get('set-cookie')!.split(';')[0];
  const blocked = await fetch(`${API}/customers`, { headers: { cookie } });
  assert.equal(blocked.status, 401);
  assert.equal((await blocked.json()).message, 'mfa_required');

  // Set up the app; a wrong code is refused, the right one signs in and returns 8 recovery codes.
  const post = (path: string, body: unknown) => fetch(`${API}${path}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const setup = await (await post('/auth/two-step/setup', {})).json();
  assert.match(setup.qrSvg, /^<svg/);
  assert.match(setup.otpauthUrl, /^otpauth:\/\/totp\/ANANDA/);
  secrets.set('maria@ananda.test', setup.secret.replace(/\s/g, ''));
  assert.equal((await (await post('/auth/two-step/enable', { code: '000000' })).json()).message, 'bad_code');
  const on = await post('/auth/two-step/enable', { code: await freshCode('maria@ananda.test') });
  assert.equal(on.status, 200);
  const codes: string[] = (await on.json()).recoveryCodes;
  assert.equal(codes.length, 8);
  assert.equal((await fetch(`${API}/customers`, { headers: { cookie } })).status, 200);

  // Next sign-in: a recovery code works once.
  const c2 = await startSignIn('maria@ananda.test');
  const useRecovery = (c: string) => fetch(`${API}/auth/two-step/verify`, { method: 'POST', headers: { cookie: c2, 'content-type': 'application/json' }, body: JSON.stringify({ code: c }) });
  assert.equal((await useRecovery(codes[0])).status, 200);
  const c3 = await startSignIn('maria@ananda.test');
  const reused = await fetch(`${API}/auth/two-step/verify`, { method: 'POST', headers: { cookie: c3, 'content-type': 'application/json' }, body: JSON.stringify({ code: codes[0] }) });
  assert.equal((await reused.json()).message, 'bad_code');

  // Confirming a payment without the authenticator code is refused.
  const admin = await session('admin@ananda.test');
  const queue = await admin('GET', '/admin/queue');
  const waiting = queue.body.orders.find((o: any) => o.next === 'paid');
  const noCode = await admin('POST', `/admin/orders/${waiting.id}/status/paid`, {});
  assert.equal(noCode.body.message, 'bad_code');
  const stillWaiting = (await admin('GET', '/admin/queue')).body.orders.find((o: any) => o.id === waiting.id);
  assert.equal(stillWaiting.status, 'waiting_for_payment');
});

test('proforma in Hebrew: PDF and the customer e-mail', async () => {
  const ivan = await session('ivan@ananda.test');
  const list = await ivan('GET', '/customers');
  const c = list.body.customers.find((x: any) => !['waiting_for_approval', 'rejected', 'new'].includes(x.chip.kind)) ?? list.body.customers[0];
  const since = Date.now();
  const sale = await ivan('POST', '/sales', { customerId: c.id, cartons: { gaia: 2 }, language: 'he', idempotencyKey: crypto.randomUUID() });
  assert.equal(sale.status, 201, JSON.stringify(sale.body));
  const pdf = await fetch(`${API}/orders/${sale.body.orderId}/proforma.pdf`, { headers: { cookie: await loginCookie('ivan@ananda.test') } });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.ok((await pdf.arrayBuffer()).byteLength > 10_000);
  let subject = '';
  for (let i = 0; i < 40 && !subject; i++) {
    const msgs = (await (await fetch(`${MAILPIT}/api/v1/messages?limit=20`)).json()).messages;
    subject = msgs.find((m: any) => Date.parse(m.Created) >= since - 1000 && m.Subject.includes('פרופורמה'))?.Subject ?? '';
    if (!subject) await new Promise((r) => setTimeout(r, 250));
  }
  assert.match(subject, /ANANDA פרופורמה S-\d{4}/);
});
