import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { LOCALES, type Locale } from '@ananda-agents/shared';

export const LOCALE_COOKIE = 'aa_locale';

export function asLocale(v: string | undefined): Locale {
  return (LOCALES as readonly string[]).includes(v ?? '') ? (v as Locale) : 'en';
}

export default getRequestConfig(async () => {
  const locale = asLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return { locale, messages: (await import(`../messages/${locale}.json`)).default, timeZone: 'Europe/Sofia' };
});
