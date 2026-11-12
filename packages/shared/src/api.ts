// Shapes the API returns and accepts. Money is always integer cents; dates are ISO strings.
import { z } from 'zod';
import type { CartonsByFlavour, Commission, Flavour, OwnershipState } from './domain';

export const LOCALES = ['en', 'bg', 'he'] as const;
export type Locale = (typeof LOCALES)[number];
export const PROFORMA_LANGUAGES = ['en', 'bg'] as const;
export type ProformaLanguage = (typeof PROFORMA_LANGUAGES)[number];
export type Role = 'agent' | 'admin';

export const ORDER_STATUSES = ['waiting_for_payment', 'paid', 'sent_to_warehouse', 'delivered', 'invoice_issued', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
/** What the agent sees: the stored status, with unpaid orders past their due date shown as late. */
export type OrderDisplayStatus = OrderStatus | 'late';
export type CustomerStatus = 'waiting_for_approval' | 'active' | 'rejected';
export type CustomerChip = { kind: 'late'; days: number } | { kind: 'waiting_for_approval' } | { kind: 'paid_up' } | { kind: 'owes' } | { kind: 'rejected' } | { kind: 'new' };

export interface Me {
  id: string;
  name: string;
  email: string;
  role: Role;
  locale: Locale;
  payment: PaymentDetails;
}

export interface PaymentDetails {
  accountHolder: string | null;
  ibanMasked: string | null;
  bank: string | null;
  bic: string | null;
  isSet: boolean;
}

export interface CustomerRow {
  id: string;
  number: string | null;
  name: string;
  vatNumber: string;
  country: string;
  lastOrder: { number: string; date: string } | null;
  owesCents: number;
  lateCents: number;
  chip: CustomerChip;
}

export interface CustomersOverview {
  customers: CustomerRow[];
  kpi: { lateCents: number; lateCustomers: number; dueThisWeekCents: number; unpaidCents: number };
}

export interface CustomerDetail {
  id: string;
  number: string | null;
  name: string;
  vatNumber: string;
  country: string;
  billingAddress: string;
  deliveryAddress: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  status: CustomerStatus;
  rejectedReason: string | null;
  paymentTermsDays: number;
  reverseCharge: boolean;
  ownedUntil: string | null;
  orders: OrderRow[];
  approvedPrice: { unitPriceCents: number; requestId: string } | null;
  pendingPriceRequest: { targetUnitPriceCents: number; createdAt: string } | null;
}

export interface ViesResult {
  status: 'valid' | 'invalid' | 'unavailable';
  vatNumber: string;
  country: string;
  name: string | null;
  address: string | null;
  checkedAt: string | null;
}

export interface AnandaMatch {
  state: OwnershipState;
  customerId: string | null;
  customerName: string | null;
  agentName: string | null;
  lastOrderDate: string | null;
  freeFrom: string | null;
  takeOverPending: boolean;
  remindOn: string | null;
}

export interface SearchResult {
  customers: CustomerRow[];
  vat: { vies: ViesResult; ananda: AnandaMatch } | null;
}

export interface OrderRow {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  orderedAt: string;
  units: number;
  cartons: number;
  totalCents: number;
  status: OrderDisplayStatus;
  daysLate: number;
  dueDate: string;
  commission: Commission;
  commissionStatus: 'coming' | 'paid' | 'none';
  paidAt: string | null;
  closedAt: string | null;
  reminders: number;
  lastReminderAt: string | null;
}

export interface OrderDetail extends OrderRow {
  agentName: string;
  customer: { name: string; phone: string | null; email: string | null; country: string; address: string };
  deliveryAddress: string;
  deliveryInstructions: string | null;
  language: ProformaLanguage;
  validUntil: string;
  holdUntil: string;
  lines: { flavour: Flavour; cartons: number; units: number; unitPriceCents: number; lineNetCents: number }[];
  netCents: number;
  vatCents: number;
  vatRateBp: number;
  reverseCharge: boolean;
  unitPriceCents: number;
  discounted: boolean;
  steps: { key: 'sent' | 'paid' | 'warehouse' | 'delivered' | 'invoiced'; at: string | null }[];
  corrections: { id: string; note: string; status: RequestStatus; decisionNote: string | null; createdAt: string }[];
  cancelledAt: string | null;
  emailFailed: boolean;
}

export type RequestStatus = 'pending' | 'approved' | 'declined';

export type CollectionRow = OrderRow & { phone: string | null; email: string | null };

export interface Collections {
  kpi: { lateCents: number; lateCustomers: number; dueThisWeekCents: number; remindersSent: number };
  late: CollectionRow[];
  dueSoon: CollectionRow[];
}

export interface ReminderDraft {
  to: string | null;
  cc: string[];
  subject: string;
  body: string;
  language: ProformaLanguage;
  nextAllowedAt: string | null;
}

export interface Earnings {
  comingCents: number;
  paidThisMonthCents: number;
  paidThisYearCents: number;
  orders: OrderRow[];
}

export type NotificationType =
  | 'customer_approved'
  | 'customer_rejected'
  | 'take_over_approved'
  | 'take_over_declined'
  | 'price_approved'
  | 'price_declined'
  | 'correction_resolved'
  | 'customer_free'
  | 'order_paid'
  | 'order_delivered'
  | 'commission_paid'
  | 'email_bounced';

export interface AppNotification {
  id: string;
  type: NotificationType;
  params: Record<string, string>;
  link: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationsList {
  unread: number;
  items: AppNotification[];
}

export interface SaleSent {
  orderId: string;
  number: string;
  totalCents: number;
  customerName: string;
  emailedTo: string | null;
  holdUntil: string;
  commission: Commission;
}

// ---------- Request bodies ----------

const trimmed = (max: number) => z.string().trim().min(1).max(max);
export const cartonsSchema = z.record(z.string(), z.number().int().min(0).max(99_999)) as unknown as z.ZodType<CartonsByFlavour>;

export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

export const newCustomerSchema = z.object({
  vatNumber: trimmed(20),
  contactName: trimmed(120),
  phone: z.string().trim().regex(/^\+?[0-9 ()\-]{6,20}$/, 'phone'),
  email: z.string().trim().toLowerCase().email(),
  deliveryAddress: z.string().trim().max(300).optional().nullable(),
  /** Only when VIES is unavailable or the number is not in the register; flagged for Admin review. */
  manual: z.object({ name: trimmed(200), country: z.string().trim().length(2), address: trimmed(300) }).optional(),
});
export type NewCustomerInput = z.infer<typeof newCustomerSchema>;

export const saleSchema = z.object({
  customerId: z.string().uuid(),
  cartons: cartonsSchema,
  language: z.enum(PROFORMA_LANGUAGES),
  deliveryInstructions: z.string().trim().max(500).optional().nullable(),
  idempotencyKey: z.string().uuid(),
});
export type SaleInput = z.infer<typeof saleSchema>;

export const priceRequestSchema = z.object({ targetUnitPriceCents: z.number().int().min(1).max(100_000), note: z.string().trim().max(500).optional() });
export const noteSchema = z.object({ note: trimmed(1000) });
export const optionalNoteSchema = z.object({ note: z.string().trim().max(1000).optional() });
export const reminderSchema = z.object({ subject: trimmed(200), body: trimmed(5000) });
export const paymentDetailsSchema = z.object({ accountHolder: trimmed(120), iban: trimmed(40) });
export const profileSchema = z.object({ locale: z.enum(LOCALES) });
export const decisionSchema = z.object({ note: z.string().trim().max(1000).optional() });

export type Health = { ok: boolean; db: 'up' | 'down'; time: string };
