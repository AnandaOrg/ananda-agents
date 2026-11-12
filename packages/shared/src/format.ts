// Locale-aware money, number and date formatting (EUR, Sofia calendar).

const intlLocale = (l: string) => (l === 'bg' ? 'bg-BG' : l === 'he' ? 'he-IL' : 'en-GB');

export function formatMoney(cents: number, locale = 'en', opts: { whole?: boolean } = {}): string {
  const digits = opts.whole ? 0 : 2;
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(cents / 100);
}

export function formatNumber(n: number, locale = 'en'): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(n);
}

export function formatDate(d: string | Date, locale = 'en', opts: { year?: boolean } = {}): string {
  const date = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T12:00:00Z') : new Date(d);
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
