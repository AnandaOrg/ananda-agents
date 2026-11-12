'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, Warning } from '@phosphor-icons/react';
import { useCrumbs } from '../../../../../components/AppShell';
import { ErrorBox, Loading } from '../../../../../components/ui';
import { useErrorText, useFmt, useOrder } from '../../../../../lib/hooks';

/** Screen 6: the journey ends where the brief says, with the proforma in the customer's inbox. */
export default function SentPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('sent');
  const tc = useTranslations('common');
  const fmt = useFmt();
  const errorText = useErrorText();
  const q = useOrder(id);
  useCrumbs([{ label: t('title') }]);
  if (q.isLoading) return <Loading />;
  if (!q.data) return <ErrorBox text={errorText(q.error)} onRetry={() => q.refetch()} />;
  const o = q.data;
  const emailed = !!o.customer.email && !o.emailFailed;
  return (
    <div className="stack" style={{ maxWidth: 560, marginInline: 'auto', paddingBlockStart: 24, textAlign: 'center', alignItems: 'center' }}>
      <span className="success-mark">
        <Check size={34} weight="bold" />
      </span>
      <h1 className="title-1">{t('title')}</h1>
      <p className="title-3 num">{t('summary', { amount: fmt.money(o.totalCents), number: o.number })}</p>
      {emailed ? <p className="muted">{t('emailed', { email: o.customer.email! })} · {o.customerName}</p> : null}
      {o.emailFailed && (
        <div className="banner banner-warn" style={{ textAlign: 'start' }}>
          <Warning size={20} />
          <span className="grow">{t('notEmailed')}</span>
        </div>
      )}
      <section className="card stack" style={{ width: '100%', textAlign: 'start' }}>
        <span className="overline">{t('next')}</span>
        <ol className="next-steps">
          <li>{t('step1', { date: fmt.date(o.holdUntil, true) })}</li>
          <li>{t('step2')}</li>
          <li>
            <span>
              {t('step3', { amount: fmt.money(o.commission.grossCents) })}{' '}
              <span className="small muted">({tc('plusVat', { net: fmt.money(o.commission.netCents), vat: fmt.money(o.commission.vatCents), gross: fmt.money(o.commission.grossCents) })})</span>
            </span>
          </li>
        </ol>
      </section>
      <div className="actions" style={{ justifyContent: 'center' }}>
        <Link href="/customers" className="btn">{t('backToCustomers')}</Link>
        <Link href={`/orders/${o.id}`} className="btn btn-primary">{t('seeInOrders')}</Link>
      </div>
    </div>
  );
}

