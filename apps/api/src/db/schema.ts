// Database schema. Money in integer cents. Contact data and IBANs are stored encrypted
// (AES-256-GCM, see core/crypto.ts); columns ending in _enc hold ciphertext.
import { boolean, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

const pk = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const roleEnum = pgEnum('role', ['agent', 'admin']);
export const localeEnum = pgEnum('locale', ['en', 'bg', 'he']);
export const proformaLanguageEnum = pgEnum('proforma_language', ['en', 'bg']);
export const customerStatusEnum = pgEnum('customer_status', ['waiting_for_approval', 'active', 'rejected']);
export const customerSourceEnum = pgEnum('customer_source', ['vies', 'manual']);
export const flavourEnum = pgEnum('flavour', ['aloha', 'gaia', 'santorini', 'kyoto']);
export const orderStatusEnum = pgEnum('order_status', ['waiting_for_payment', 'paid', 'sent_to_warehouse', 'delivered', 'invoice_issued', 'cancelled']);
export const requestTypeEnum = pgEnum('request_type', ['take_over', 'price', 'correction']);
export const requestStatusEnum = pgEnum('request_status', ['pending', 'approved', 'declined']);

export const users = pgTable('users', {
  id: pk(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: roleEnum('role').notNull().default('agent'),
  locale: localeEnum('locale').notNull().default('en'),
  phone: text('phone'),
  accountHolder: text('account_holder'),
  ibanEnc: text('iban_enc'),
  ibanLast4: text('iban_last4'),
  bank: text('bank'),
  bic: text('bic'),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

export const sessions = pgTable('sessions', {
  id: pk(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: ts('expires_at').notNull(),
  createdAt: createdAt(),
});

export const customers = pgTable(
  'customers',
  {
    id: pk(),
    number: text('number').unique(),
    vatNumber: text('vat_number').notNull().unique(),
    name: text('name').notNull(),
    country: text('country').notNull(),
    billingAddress: text('billing_address').notNull(),
    deliveryAddress: text('delivery_address'),
    contactNameEnc: text('contact_name_enc'),
    phoneEnc: text('phone_enc'),
    emailEnc: text('email_enc'),
    status: customerStatusEnum('status').notNull().default('waiting_for_approval'),
    source: customerSourceEnum('source').notNull().default('vies'),
    /** Typed by hand because VIES was down or did not know the number. */
    needsReview: boolean('needs_review').notNull().default(false),
    rejectedReason: text('rejected_reason'),
    paymentTermsDays: integer('payment_terms_days').notNull().default(0),
    ownerAgentId: uuid('owner_agent_id').references(() => users.id),
    ownedSince: ts('owned_since'),
    lastOrderAt: ts('last_order_at'),
    createdBy: uuid('created_by').references(() => users.id),
    approvedAt: ts('approved_at'),
    createdAt: createdAt(),
  },
  (t) => [index('customers_owner_idx').on(t.ownerAgentId), index('customers_name_idx').on(t.name)],
);

export const viesCache = pgTable('vies_cache', {
  vatNumber: text('vat_number').primaryKey(),
  valid: boolean('valid').notNull(),
  name: text('name'),
  address: text('address'),
  country: text('country').notNull(),
  checkedAt: ts('checked_at').notNull().defaultNow(),
});

export const orders = pgTable(
  'orders',
  {
    id: pk(),
    number: text('number').notNull().unique(),
    customerId: uuid('customer_id').notNull().references(() => customers.id),
    agentId: uuid('agent_id').notNull().references(() => users.id),
    status: orderStatusEnum('status').notNull().default('waiting_for_payment'),
    language: proformaLanguageEnum('language').notNull().default('en'),
    totalCartons: integer('total_cartons').notNull(),
    totalUnits: integer('total_units').notNull(),
    tierUnitPriceCents: integer('tier_unit_price_cents').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    netCents: integer('net_cents').notNull(),
    vatRateBp: integer('vat_rate_bp').notNull(),
    vatCents: integer('vat_cents').notNull(),
    totalCents: integer('total_cents').notNull(),
    commissionCents: integer('commission_cents').notNull(),
    priceRequestId: uuid('price_request_id'),
    /** Snapshot of the customer's legal details at issue time, for the PDF. */
    billTo: jsonb('bill_to').$type<{ name: string; vatNumber: string; country: string; address: string; customerNumber: string | null }>().notNull(),
    deliveryAddress: text('delivery_address').notNull(),
    deliveryInstructions: text('delivery_instructions'),
    paymentTermsDays: integer('payment_terms_days').notNull(),
    issuedAt: ts('issued_at').notNull().defaultNow(),
    validUntil: date('valid_until').notNull(),
    dueDate: date('due_date').notNull(),
    holdUntil: date('hold_until').notNull(),
    paidAt: ts('paid_at'),
    sentToWarehouseAt: ts('sent_to_warehouse_at'),
    deliveredAt: ts('delivered_at'),
    invoicedAt: ts('invoiced_at'),
    cancelledAt: ts('cancelled_at'),
    emailedTo: text('emailed_to'),
    emailError: text('email_error'),
    idempotencyKey: uuid('idempotency_key').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('orders_idempotency_idx').on(t.agentId, t.idempotencyKey),
    index('orders_agent_idx').on(t.agentId),
    index('orders_customer_idx').on(t.customerId),
  ],
);

export const orderLines = pgTable('order_lines', {
  id: pk(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  flavour: flavourEnum('flavour').notNull(),
  cartons: integer('cartons').notNull(),
  units: integer('units').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  lineNetCents: integer('line_net_cents').notNull(),
});

/** Agent → Admin requests: take a customer over, a lower price, or a correction on an order. */
export const requests = pgTable(
  'requests',
  {
    id: pk(),
    type: requestTypeEnum('type').notNull(),
    status: requestStatusEnum('status').notNull().default('pending'),
    agentId: uuid('agent_id').notNull().references(() => users.id),
    customerId: uuid('customer_id').references(() => customers.id),
    orderId: uuid('order_id').references(() => orders.id),
    note: text('note'),
    targetUnitPriceCents: integer('target_unit_price_cents'),
    /** Price requests: the order that used the approved price. */
    usedByOrderId: uuid('used_by_order_id'),
    decisionNote: text('decision_note'),
    decidedBy: uuid('decided_by').references(() => users.id),
    decidedAt: ts('decided_at'),
    createdAt: createdAt(),
  },
  (t) => [index('requests_agent_idx').on(t.agentId, t.type, t.status)],
);

export const freeReminders = pgTable(
  'free_reminders',
  {
    id: pk(),
    agentId: uuid('agent_id').notNull().references(() => users.id),
    customerId: uuid('customer_id').notNull().references(() => customers.id),
    notifyOn: date('notify_on').notNull(),
    sentAt: ts('sent_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('free_reminders_unique').on(t.agentId, t.customerId)],
);

export const paymentReminders = pgTable(
  'payment_reminders',
  {
    id: pk(),
    orderId: uuid('order_id').notNull().references(() => orders.id),
    agentId: uuid('agent_id').notNull().references(() => users.id),
    toEmail: text('to_email').notNull(),
    cc: text('cc').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    sentAt: ts('sent_at').notNull().defaultNow(),
  },
  (t) => [index('payment_reminders_order_idx').on(t.orderId)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: pk(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    params: jsonb('params').$type<Record<string, string>>().notNull().default({}),
    link: text('link').notNull(),
    readAt: ts('read_at'),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
);

/** Append-only (a trigger rejects UPDATE and DELETE; see migration 0001). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: pk(),
    actorId: uuid('actor_id').references(() => users.id),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    at: ts('at').notNull().defaultNow(),
  },
  (t) => [index('audit_entity_idx').on(t.entity, t.entityId)],
);

export const numberSequences = pgTable('number_sequences', {
  key: text('key').primaryKey(),
  next: integer('next').notNull(),
});

export type CustomerId = (typeof customers.$inferSelect)['id'];
export type OrderStatusValue = (typeof orderStatusEnum.enumValues)[number];
