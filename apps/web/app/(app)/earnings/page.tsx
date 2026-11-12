'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CaretRight, Info } from '@phosphor-icons/react';
import { BankBanner, useCrumbs } from '../../../components/AppShell';
import { CommissionChip, Empty, ErrorBox, Loading, Tile } from '../../../components/ui';
import { useEarnings, useErrorText, useFmt } from '../../../lib/hooks';

/** Screen 11: what's coming first (#14); two words everywhere: Coming and Paid (#2). */
export default function EarningsPage() {
  const t = useTranslations('earnings');
  const fmt = useFmt();
  const errorText = useErrorText();
  const q = useEarnings();
  useCrumbs([{ label: t('title') }]);
  if (q.isLoading) return <Loading />;
  if (!q.data) return <ErrorBox text={errorText(q.error)} onRetry={() => q.refetch()} />;
  const e = q.data;
  return (
    <>
      <BankBanner />
      <h1 className="title-1" style={{ marginBlockEnd: 16 }}>{t('title')}</h1>
      <div className="tiles">
        <Tile
          label={t('coming')}
          value={fmt.money(e.comingCents)}
          tone="accent"
          sub={
            <span title={t('comingInfo')}>
              <Info size={13} style={{ verticalAlign: '-2px' }} /> {t('comingInfo')}
            </span>
          }
        />
        <Tile label={t('paidMonth')} value={fmt.money(e.paidThisMonthCents)} />
        <Tile label={t('paidYear')} value={fmt.money(e.paidThisYearCents)} />
      </div>
      <h2 className="title-3" style={{ marginBlockEnd: 12 }}>{t('byOrder')}</h2>
      <div className="list" style={{ '--cols': 'minmax(0,1.4fr) minmax(0,1.4fr) 150px 110px 20px' } as React.CSSProperties}>
        <div className="list-head" aria-hidden>
          <span>{t('colCustomer')}</span>
          <span>{t('colOrder')}</span>
          <span className="end">{t('colCommission')}</span>
          <span>{t('colStatus')}</span>
          <span />
        </div>
        {e.orders.map((o) => (
          <Link key={o.id} href={`/orders/${o.id}`} className="list-row">
            <span className="strong">{o.customerName}</span>
            <span className="small muted">
              <span className="num">{o.number}</span> · {o.paidAt ? t('customerPaid', { date: fmt.date(o.paidAt) }) : t('notPaidYet')}
            </span>
            <span className={`end num strong ${o.commissionStatus === 'coming' ? 'accent' : ''}`}>{fmt.money(o.commission.grossCents)}</span>
            <span>
              <CommissionChip status={o.commissionStatus} />
            </span>
            <CaretRight size={16} className="chev" />
          </Link>
        ))}
        {!e.orders.length && <Empty>{t('empty')}</Empty>}
      </div>
      <p className="foot-note">{t('footer')}</p>
    </>
  );
}
