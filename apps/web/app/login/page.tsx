'use client';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { EnvelopeSimple, GoogleLogo, WarningCircle } from '@phosphor-icons/react';
import { api, post, ApiError } from '../../lib/api';
import { AuthFrame, safeNext } from '../../components/AuthFrame';
import { InlineError, Spinner } from '../../components/ui';

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

/** Sign-in, first step (client decision): Google or an e-mail link. The authenticator code follows. */
function Login() {
  const t = useTranslations('login');
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const [google, setGoogle] = useState(false);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    api<{ google: boolean }>('/auth/config').then((c) => setGoogle(c.google), () => setGoogle(false));
  }, []);

  const send = async (to: string) => {
    setBusy(true);
    setError(null);
    try {
      await post('/auth/link', { email: to, ...(next ? { next } : {}) });
      setSentTo(to);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'error';
      setError(code === 'too_many_attempts' ? t('tooMany') : code === 'offline' ? t('offline') : t('notSent'));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const v = email.trim();
    if (!v) return setError(t('typeEmail'));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return setError(t('badEmail'));
    void send(v);
  };

  const googleError = params.get('error');

  if (sentTo)
    return (
      <AuthFrame title={t('checkTitle')} sub={t('checkSub')}>
        <div className="field">
          <span className="label">{t('sentTo')}</span>
          <div className="spread">
            <span className="strong" style={{ overflowWrap: 'anywhere' }}>{sentTo}</span>
            <button className="link-btn" onClick={() => { setSentTo(null); setResent(false); }}>{t('change')}</button>
          </div>
        </div>
        <p className="hint">{t('nothingThere')}</p>
        {error && <InlineError>{error}</InlineError>}
        <button
          className="btn btn-block"
          disabled={resent}
          aria-busy={busy}
          onClick={async () => {
            if (busy) return;
            await send(sentTo);
            setResent(true);
            setTimeout(() => setResent(false), 60_000);
          }}
        >
          {busy && <Spinner />}
          {resent ? t('sentAgain') : t('sendAgain')}
        </button>
      </AuthFrame>
    );

  return (
    <AuthFrame title={t('title')} sub={google ? t('subtitle') : t('subtitleLinkOnly')}>
      {googleError && (
        <div className="banner" role="alert" style={{ margin: 0 }}>
          <WarningCircle size={20} />
          <div className="grow">
            <div className="banner-title">{googleError === 'google_no_account' ? t('noAccountTitle') : t('googleFailedTitle')}</div>
            <div className="small muted">{googleError === 'google_no_account' ? t('noAccountText') : t('googleFailedText')}</div>
          </div>
        </div>
      )}
      {google && (
        <>
          <a className="btn btn-block btn-lg" href={`/api/auth/google${next ? `?next=${encodeURIComponent(next)}` : ''}`}>
            <GoogleLogo size={20} weight="bold" /> {t('google')}
          </a>
          <div className="divider" role="separator">
            <span>{t('or')}</span>
          </div>
        </>
      )}
      <form className="stack" onSubmit={submit} noValidate>
        <label className="field">
          <span className="label">{t('email')}</span>
          <input
            className={`input ${error ? 'input-error' : ''}`}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoFocus
            aria-invalid={!!error}
          />
        </label>
        {error && <InlineError>{error}</InlineError>}
        <button className="btn btn-primary btn-block btn-lg" aria-busy={busy}>
          {busy ? <Spinner /> : <EnvelopeSimple size={18} />}
          {t('sendLink')}
        </button>
      </form>
    </AuthFrame>
  );
}
