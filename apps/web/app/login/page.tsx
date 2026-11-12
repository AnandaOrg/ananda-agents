'use client';
import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { post, ApiError } from '../../lib/api';

export default function LoginPage() {
  const t = useTranslations('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ role: string; locale: string }>('/auth/login', { email, password });
      document.cookie = `aa_locale=${res.locale}; path=/; max-age=31536000; samesite=lax`;
      window.location.href = res.role === 'admin' ? '/admin' : '/customers';
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? t('tooMany') : t('bad'));
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <form className="card stack" onSubmit={submit} noValidate>
        <div>
          <div className="brand" style={{ padding: 0 }}>ANANDA</div>
          <p className="muted">{t('subtitle')}</p>
        </div>
        <h1 className="title-2">{t('title')}</h1>
        <label className="field">
          <span className="label">{t('email')}</span>
          <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span className="label">{t('password')}</span>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error-text" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy || !email || !password}>{t('submit')}</button>
      </form>
    </main>
  );
}
