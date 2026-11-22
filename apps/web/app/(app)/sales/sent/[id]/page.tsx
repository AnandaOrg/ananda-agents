'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, Warning } from '@phosphor-icons/react';
import { useCrumbs } from '../../../../../components/AppShell';
import { Loading, QueryError } from '../../../../../components/ui';
import { useFmt, useOrder } from '../../../../../lib/hooks';

/** Screen 6: the journey ends where the brief says, with the proforma in the customer's inbox. */
export default function SentPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('sent');
  const tn = useTranslations('nav');
  const fmt = useFmt();
  const q = useOrder(id);
  useCrumbs([{ label: tn('newSale'), href: '/sales/new' }, { label: t('title') }]);
  if (q.isLoading) return <Loading />;
  if (!q.data) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  const o = q.data;
  const emailed = !!o.customer.email && !o.emailFailed;
  const steps = [
    { t: t('step1', { date: fmt.date(o.holdUntil, true) }), current: true },
    { t: t('step2') },
    // Commission in the sale flow is the net figure (decision 3); the order page spells out the VAT.
    { t: t('step3', { amount: fmt.money(o.commission.netCents) }) },
  ];
  return (
    <>
      <div className="stack" style={{ maxWidth: 600, marginInline: 'auto', paddingBlockStart: 'var(--space-6)', alignItems: 'center', textAlign: 'center' }}>
        <span className="success-mark" aria-hidden>
          <Check size={32} weight="bold" />
        </span>
        <h1 className="title-1" style={{ fontWeight: 500 }}>{t('title')}</h1>
        <p className="title-3 num">{t('summary', { amount: fmt.money(o.totalCents), number: o.number })}</p>
        {emailed && <p className="muted">{t('emailed', { email: o.customer.email! })} · {o.customerName}</p>}
        {o.emailFailed && (
          <div className="banner banner-warn" style={{ textAlign: 'start', width: '100%' }}>
            <Warning size={20} />
            <span className="grow">{t('notEmailed')}</span>
          </div>
        )}
        <section className="card stack" style={{ width: '100%', textAlign: 'start' }}>
          <h2 className="section-title" style={{ margin: 0 }}>{t('next')}</h2>
          <ol className="psteps">
            {steps.map((s, i) => (
              <li key={i} className={`pstep ${s.current ? 'current' : ''}`}>
                <span className="mark num" aria-hidden>{i + 1}</span>
                <span className="t" style={{ color: 'var(--text)' }}>{s.t}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <div className="action-bar" style={{ maxWidth: 600, marginInline: 'auto' }}>
        <div className="actions push" style={{ justifyContent: 'flex-end' }}>
          <Link href="/customers" className="btn">{t('backToCustomers')}</Link>
          <Link href={`/orders/${o.id}`} className="btn btn-primary">{t('seeInOrders')}</Link>
        </div>
      </div>
    </>
  );
}
