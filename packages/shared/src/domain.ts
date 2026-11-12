// Business rules for the agent app. Every derived figure (tier, VAT, totals, commission,
// ownership, due dates) is computed here once and used by the API, the web app and the PDF.
//
// Mirrors ananda-admin/packages/shared/src/domain.ts (the Admin app owns these rules). Where the
// Sales Agent PRD (9 Nov 2026) states a different value, the PRD value is used and marked "PRD".

export const FLAVOURS = ['aloha', 'gaia', 'santorini', 'kyoto'] as const;
export type Flavour = (typeof FLAVOURS)[number];
export const FLAVOUR_NAMES: Record<Flavour, string> = { aloha: 'ALOHA', gaia: 'GAIA', santorini: 'SANTORINI', kyoto: 'KYOTO' };

export const UNITS_PER_CARTON = 24;
/** PRD UC-05: at least one carton to continue (Admin app uses 42; open question for Royi). */
export const MIN_ORDER_CARTONS = 1;
export const VAT_RATE_BP = 2000; // 20% in basis points
export const COMMISSION_PER_UNIT_CENTS = 50;
export const COMMISSION_VAT_BP = 2000;
export const STOCK_HOLD_DAYS = 7;
/** PRD: proforma valid 14 days (Admin app uses 7). */
export const PROFORMA_VALIDITY_DAYS = 14;
export const OWNERSHIP_MONTHS = 6;
export const HOME_COUNTRY = 'BG';
export const REMINDER_COOLDOWN_HOURS = 24;

export interface PriceTier {
  minCartons: number;
  unitPriceCents: number;
}

/** Tier by total cartons across flavours (Admin PRD §7.1), with the base tier opened from 1 carton. */
export const PRICE_TIERS: PriceTier[] = [
  { minCartons: 1, unitPriceCents: 515 },
  { minCartons: 210, unitPriceCents: 510 },
  { minCartons: 417, unitPriceCents: 505 },
  { minCartons: 834, unitPriceCents: 502 },
  { minCartons: 1667, unitPriceCents: 497 },
  { minCartons: 2500, unitPriceCents: 493 },
  { minCartons: 3334, unitPriceCents: 488 },
];

export function tierFor(totalCartons: number): PriceTier {
  let tier = PRICE_TIERS[0];
  for (const t of PRICE_TIERS) if (totalCartons >= t.minCartons) tier = t;
  return tier;
}

export function nextTierFor(totalCartons: number): (PriceTier & { cartonsToGo: number }) | null {
  const next = PRICE_TIERS.find((t) => t.minCartons > totalCartons);
  return next ? { ...next, cartonsToGo: next.minCartons - totalCartons } : null;
}

export type CartonsByFlavour = Partial<Record<Flavour, number>>;

export function cleanCartons(input: CartonsByFlavour): CartonsByFlavour {
  const out: CartonsByFlavour = {};
  for (const f of FLAVOURS) {
    const n = Math.floor(Number(input[f] ?? 0));
    if (Number.isFinite(n) && n > 0) out[f] = Math.min(n, 99_999);
  }
  return out;
}

export function cartonsTotal(cartons: CartonsByFlavour): number {
  return FLAVOURS.reduce((s, f) => s + (cleanCartons(cartons)[f] ?? 0), 0);
}

/** EU customers outside Bulgaria pay 0% VAT under reverse charge; Bulgaria pays 20%. */
export function isReverseCharge(country: string): boolean {
  return country.toUpperCase() !== HOME_COUNTRY;
}

export function vatRateFor(country: string): number {
  return isReverseCharge(country) ? 0 : VAT_RATE_BP;
}

/** Rounded once per document, half away from zero. */
export function pctOf(cents: number, bp: number): number {
  return Math.round((cents * bp) / 10_000);
}

/** Commission = units × €0.50 net, minus any approved discount (discounts come out of commission first). */
export function commissionFor(units: number, tierUnitPriceCents: number, unitPriceCents: number): number {
  const discount = Math.max(0, tierUnitPriceCents - unitPriceCents) * units;
  return Math.max(0, units * COMMISSION_PER_UNIT_CENTS - discount);
}

export interface Commission {
  netCents: number;
  vatCents: number;
  grossCents: number;
}

export function commissionBreakdown(netCents: number): Commission {
  const vatCents = pctOf(netCents, COMMISSION_VAT_BP);
  return { netCents, vatCents, grossCents: netCents + vatCents };
}

export interface OrderLineCalc {
  flavour: Flavour;
  cartons: number;
  units: number;
  unitPriceCents: number;
  lineNetCents: number;
}

export interface OrderCalc {
  lines: OrderLineCalc[];
  totalCartons: number;
  totalUnits: number;
  tierUnitPriceCents: number;
  unitPriceCents: number;
  discounted: boolean;
  nextTier: (PriceTier & { cartonsToGo: number }) | null;
  netCents: number;
  vatRateBp: number;
  reverseCharge: boolean;
  vatCents: number;
  totalCents: number;
  commission: Commission;
  canContinue: boolean;
}

export function calculateOrder(cartons: CartonsByFlavour, country: string, approvedUnitPriceCents?: number | null): OrderCalc {
  const clean = cleanCartons(cartons);
  const totalCartons = cartonsTotal(clean);
  const tier = tierFor(totalCartons);
  const discounted = approvedUnitPriceCents != null && approvedUnitPriceCents < tier.unitPriceCents;
  const unitPriceCents = discounted ? approvedUnitPriceCents! : tier.unitPriceCents;
  const lines = FLAVOURS.filter((f) => clean[f]).map((flavour) => {
    const units = clean[flavour]! * UNITS_PER_CARTON;
    return { flavour, cartons: clean[flavour]!, units, unitPriceCents, lineNetCents: units * unitPriceCents };
  });
  const totalUnits = totalCartons * UNITS_PER_CARTON;
  const netCents = lines.reduce((s, l) => s + l.lineNetCents, 0);
  const vatRateBp = vatRateFor(country);
  const vatCents = pctOf(netCents, vatRateBp);
  return {
    lines,
    totalCartons,
    totalUnits,
    tierUnitPriceCents: tier.unitPriceCents,
    unitPriceCents,
    discounted,
    nextTier: nextTierFor(totalCartons),
    netCents,
    vatRateBp,
    reverseCharge: vatRateBp === 0,
    vatCents,
    totalCents: netCents + vatCents,
    commission: commissionBreakdown(commissionFor(totalUnits, tier.unitPriceCents, unitPriceCents)),
    canContinue: totalCartons >= MIN_ORDER_CARTONS,
  };
}

// ---------- Dates ----------

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** yyyy-mm-dd in Sofia time, the business's calendar. */
export function isoDate(d: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso + 'T00:00:00Z') - Date.parse(fromIso + 'T00:00:00Z')) / 86_400_000);
}

/**
 * Due date of a proforma. "Due on receipt" (0 days) is given the 7-day stock hold before it
 * counts as late, so a fresh proforma reads "Waiting for payment" (assumption, see README).
 */
export function dueDateFor(issuedAt: Date, paymentTermsDays: number): string {
  return isoDate(addDays(issuedAt, Math.max(paymentTermsDays, STOCK_HOLD_DAYS)));
}

// ---------- Ownership (6-month rule) ----------

export type OwnershipState = 'not_customer' | 'free' | 'own' | 'other';

/** An owner keeps a customer for 6 months after the last (non-cancelled) order, or after claiming it. */
export function ownedUntil(lastOrderAt: Date | string | null, ownedSince: Date | string | null): Date | null {
  const from = [lastOrderAt, ownedSince].filter(Boolean).map((d) => new Date(d!).getTime());
  if (!from.length) return null;
  return addMonths(new Date(Math.max(...from)), OWNERSHIP_MONTHS);
}

export function ownershipState(
  viewerId: string,
  c: { ownerAgentId: string | null; lastOrderAt: Date | string | null; ownedSince: Date | string | null; pending?: boolean },
  now = new Date(),
): Exclude<OwnershipState, 'not_customer'> {
  if (!c.ownerAgentId) return 'free';
  if (c.pending) return c.ownerAgentId === viewerId ? 'own' : 'other';
  const until = ownedUntil(c.lastOrderAt, c.ownedSince);
  if (!until || until.getTime() < now.getTime()) return 'free';
  return c.ownerAgentId === viewerId ? 'own' : 'other';
}
