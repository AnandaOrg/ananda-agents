import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Providers } from '../components/providers';
import './globals.css';

export const metadata: Metadata = { title: 'ANANDA · Sales agent', description: 'Customers, sales, collections and commission for ANANDA agents.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0A0A0B', viewportFit: 'cover' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={locale === 'he' ? 'rtl' : 'ltr'}>
      <body>
        <NextIntlClientProvider locale={locale} messages={await getMessages()} timeZone="Europe/Sofia">
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
