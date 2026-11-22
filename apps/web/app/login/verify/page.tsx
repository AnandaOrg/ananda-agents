'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ClockCountdown } from '@phosphor-icons/react';
import { post, ApiError } from '../../../lib/api';
import { AuthFrame, safeNext } from '../../../components/AuthFrame';
import { Spinner } from '../../../components/ui';

export default function VerifyPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}

/** Opens the e-mailed sign-in link, then hands over to the authenticator code. */
function Verify() {
  const t = useTranslations('login');
  const params = useSearchParams();
  const [problem, setProblem] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = params.get('token') ?? '';
    const next = safeNext(params.get('next'));
    post('/auth/link/verify', { token }).then(
      () => window.location.replace(`/login/two-step${next ? `?next=${encodeURIComponent(next)}` : ''}`),
      (err) => setProblem(err instanceof ApiError ? err.code : 'error'),
    );
  }, [params]);

  if (!problem)
    return (
      <AuthFrame title={t('signingIn')}>
        <span className="row-flex muted" style={{ justifyContent: 'center' }} role="status">
          <Spinner /> {t('checkingLink')}
        </span>
      </AuthFrame>
    );

  const title = problem === 'link_expired' ? t('expiredTitle') : problem === 'link_used' ? t('usedTitle') : t('badLinkTitle');
  return (
    <AuthFrame title={title} sub={t('linkRules')}>
      <span className="row-flex muted" style={{ justifyContent: 'center' }}>
        <ClockCountdown size={20} />
      </span>
      <Link className="btn btn-primary btn-block btn-lg" href="/login">{t('newLink')}</Link>
    </AuthFrame>
  );
}
