import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Providers } from '../components/providers';
import { THEME_COOKIE, asTheme } from '../lib/theme';
import './tokens.css';
import './globals.css';

export const metadata: Metadata = { title: 'ANANDA · Broker', description: 'Customers, sales, collections and commission for ANANDA brokers.' };
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0A0A0B' },
    { media: '(prefers-color-scheme: light)', color: '#F8F8F8' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  // Dark is the default for everyone, also on a device set to light (README › Light mode).
  const theme = asTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang={locale} dir={locale === 'he' ? 'rtl' : 'ltr'} data-theme={theme}>
      <body>
        <NextIntlClientProvider locale={locale} messages={await getMessages()} timeZone="Europe/Sofia">
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
