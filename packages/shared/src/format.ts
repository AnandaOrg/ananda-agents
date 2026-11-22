// Locale-aware money, number and date formatting (EUR, Sofia calendar).

const intlLocale = (l: string) => (l === 'bg' ? 'bg-BG' : l === 'he' ? 'he-IL' : 'en-GB');

// Design system › Numbers, money and dates. Intl gives "6822,72 €" for Bulgarian, so money and
// numbers are built here: the euro sign always goes first, thousands are grouped also in four-digit
// numbers, and Hebrew keeps amounts left-to-right with bidi isolation marks.
const SEPARATORS: Record<string, { group: string; decimal: string }> = {
  en: { group: ',', decimal: '.' },
  bg: { group: '\u00A0', decimal: ',' },
  he: { group: ',', decimal: '.' },
};
const LRI = '\u2066';
const PDI = '\u2069';

function grouped(n: number, digits: number, locale: string): string {
  const { group, decimal } = SEPARATORS[locale] ?? SEPARATORS.en;
  const [int, frac] = Math.abs(n).toFixed(digits).split('.');
  const body = int.replace(/\B(?=(\d{3})+(?!\d))/g, group) + (frac ? decimal + frac : '');
  return (n < 0 ? '-' : '') + body;
}

/** €6,822.72 (EN, HE) · €6 822,72 (BG) */
export function formatMoney(cents: number, locale = 'en', opts: { whole?: boolean } = {}): string {
  const digits = opts.whole ? 0 : 2;
  const value = opts.whole ? Math.round(cents / 100) : cents / 100;
  const text = `${value < 0 ? '-' : ''}€${grouped(Math.abs(value), digits, locale)}`;
  return locale === 'he' ? LRI + text + PDI : text;
}

export function formatNumber(n: number, locale = 'en'): string {
  const text = grouped(n, Number.isInteger(n) ? 0 : 2, locale);
  return locale === 'he' ? LRI + text + PDI : text;
}

/** EN 3 Nov 2026 · BG 03.11.2026 (03.11 without the year) · HE per Intl. Always the Sofia calendar day. */
export function formatDate(d: string | Date, locale = 'en', opts: { year?: boolean } = {}): string {
  const date = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T12:00:00Z') : new Date(d);
  if (locale === 'bg') {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Sofia' }).formatToParts(date).map((x) => [x.type, x.value]),
    );
    return opts.year ? `${p.day}.${p.month}.${p.year}` : `${p.day}.${p.month}`;
  }
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'short',
    ...(opts.year ? { year: 'numeric' } : {}),
    timeZone: 'Europe/Sofia',
  }).format(date);
}

export function docNumber(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(4, '0')}`;
}
