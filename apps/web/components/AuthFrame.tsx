'use client';
import type { ReactNode } from 'react';

/** Full-screen sign-in layout: centred wordmark, title and sub-line, one card (no app shell). */
export function AuthFrame({ title, sub, children, wide }: { title: ReactNode; sub?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <main className="login">
      <span className="wordmark" aria-label="ANANDA">ANANDA</span>
      <div className="heads">
        <h1 className="title-1">{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      <div className="card stack" style={wide ? { width: 'min(460px, 100%)' } : undefined}>
        {children}
      </div>
    </main>
  );
}

/** Same-site path only, so a crafted link can't send people elsewhere after signing in. */
export function safeNext(raw: string | null | undefined): string | null {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/login') ? raw : null;
}
