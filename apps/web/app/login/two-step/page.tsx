'use client';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Copy, ShieldCheck } from '@phosphor-icons/react';
import type { SignedIn, TwoStepSetup, TwoStepState } from '@ananda-agents/shared';
import { api, post, ApiError } from '../../../lib/api';
import { applyTheme } from '../../../lib/theme';
import { AuthFrame, safeNext } from '../../../components/AuthFrame';
import { InlineError, Spinner } from '../../../components/ui';

export default function TwoStepPage() {
  return (
    <Suspense>
      <TwoStep />
    </Suspense>
  );
}

/** Second sign-in step: the authenticator-app code. The first time, set the app up and save the
 *  recovery codes. */
function TwoStep() {
  const t = useTranslations('twoStep');
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const [state, setState] = useState<TwoStepState | null>(null);
  const [setup, setSetup] = useState<TwoStepSetup | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [home, setHome] = useState('/customers');

  useEffect(() => {
    api<TwoStepState>('/auth/two-step').then(
      (s) => {
        if (!s.pending) return window.location.replace(next ?? '/');
        setState(s);
        if (!s.on) post<TwoStepSetup>('/auth/two-step/setup').then(setSetup, () => undefined);
      },
      () => window.location.replace(`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`),
    );
  }, [next]);

  const finish = (res: SignedIn) => {
    document.cookie = `aa_locale=${res.locale}; path=/; max-age=31536000; samesite=lax`;
    applyTheme(res.theme);
    const target = res.role === 'admin' ? '/admin' : '/customers';
    const dest = next && (res.role === 'admin') === next.startsWith('/admin') ? next : target;
    if (res.recoveryCodes?.length) {
      setHome(dest);
      setRecovery(res.recoveryCodes);
    } else window.location.replace(dest);
  };

  if (recovery) return <RecoveryCodes codes={recovery} onDone={() => window.location.replace(home)} />;
  if (!state)
    return (
      <AuthFrame title={t('title')}>
        <span className="row-flex muted" style={{ justifyContent: 'center' }} role="status"><Spinner /></span>
      </AuthFrame>
    );

  if (!state.on)
    return (
      <AuthFrame title={t('setupTitle')} sub={t('setupSub')} wide>
        <ol className="psteps" style={{ gap: 0 }}>
          <li className="pstep current">
            <span className="mark num" aria-hidden>1</span>
            <span className="t">{t('setupStep1')}</span>
          </li>
        </ol>
        <div className="qr" aria-label={t('qrLabel')} role="img">
          {setup ? <span dangerouslySetInnerHTML={{ __html: setup.qrSvg }} /> : <Spinner />}
        </div>
        {setup && (
          <div className="field">
            <span className="label">{t('cantScan')}</span>
            <code className="secret num">{setup.secret}</code>
          </div>
        )}
        <ol className="psteps">
          <li className="pstep current">
            <span className="mark num" aria-hidden>2</span>
            <span className="t">{t('setupStep2')}</span>
          </li>
        </ol>
        <CodeForm action="/auth/two-step/enable" submit={t('turnOn')} onDone={finish} />
      </AuthFrame>
    );

  return (
    <AuthFrame title={t('title')} sub={t('sub', { email: state.email })}>
      <CodeForm action="/auth/two-step/verify" submit={t('continue')} onDone={finish} allowRecovery />
    </AuthFrame>
  );
}

function CodeForm({ action, submit, onDone, allowRecovery }: { action: string; submit: string; onDone: (r: SignedIn) => void; allowRecovery?: boolean }) {
  const t = useTranslations('twoStep');
  const tl = useTranslations('login');
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = recovery ? code.replace(/[\s-]/g, '').length >= 8 : /^\d{6}$/.test(code);

  const go = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await post<SignedIn>(action, { code }));
    } catch (err) {
      const c = err instanceof ApiError ? err.code : 'error';
      setError(c === 'bad_code' ? t('badCode') : c === 'too_many_attempts' ? tl('tooMany') : c === 'offline' ? tl('offline') : t('failed'));
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={go} noValidate>
      <label className="field">
        <span className="label">{recovery ? t('recoveryLabel') : t('codeLabel')}</span>
        <input
          className={`input num ${error ? 'input-error' : ''} ${recovery ? '' : 'code-input'}`}
          inputMode={recovery ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          autoCapitalize="characters"
          maxLength={recovery ? 11 : 6}
          value={code}
          onChange={(e) => setCode(recovery ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder={recovery ? 'XXXX-XXXX' : '123456'}
          autoFocus
          aria-invalid={!!error}
        />
      </label>
      {error && <InlineError>{error}</InlineError>}
      <button className="btn btn-primary btn-block btn-lg" disabled={!ready} aria-busy={busy}>
        {busy ? <Spinner /> : <ShieldCheck size={18} />}
        {submit}
      </button>
      {allowRecovery && (
        <button
          type="button"
          className="link-btn"
          style={{ alignSelf: 'center' }}
          onClick={() => {
            setRecovery(!recovery);
            setCode('');
            setError(null);
          }}
        >
          {recovery ? t('useApp') : t('useRecovery')}
        </button>
      )}
    </form>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const t = useTranslations('twoStep');
  const [copied, setCopied] = useState(false);
  return (
    <AuthFrame title={t('recoveryTitle')} sub={t('recoverySub')} wide>
      <ul className="codes num" aria-label={t('recoveryTitle')}>
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <button
        className="btn btn-block"
        onClick={() => {
          void navigator.clipboard?.writeText(codes.join('\n')).then(() => setCopied(true));
        }}
      >
        <Copy size={18} /> {copied ? t('copied') : t('copy')}
      </button>
      <button className="btn btn-primary btn-block btn-lg" onClick={onDone}>{t('saved')}</button>
    </AuthFrame>
  );
}
