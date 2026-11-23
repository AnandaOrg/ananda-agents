'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CaretRight } from '@phosphor-icons/react';
import { BankBanner, useCrumbs } from '../../../components/AppShell';
import { CommissionChip, InfoTip, PageHeader, QueryError, SkeletonRows, SkeletonTiles, Tile } from '../../../components/ui';
import { useEarnings, useFmt } from '../../../lib/hooks';

const COLS = 'minmax(0,1.4fr) minmax(0,1.4fr) 150px minmax(120px,0.7fr) 20px';

/** Screen 11: what's coming first (#14); two words everywhere: Coming and Paid (#2). */
export default function EarningsPage() {
  const t = useTranslations('earnings');
  const fmt = useFmt();
  const q = useEarnings();
  useCrumbs([{ label: t('title') }]);
  return (
    <>
      <PageHeader title={t('title')} date sub={t('subtitle')} />
      <BankBanner />
      {q.isLoading && (
        <>
          <SkeletonTiles n={3} />
          <SkeletonRows cols={COLS} values={3} />
        </>
      )}
      {!q.isLoading && !q.data && <QueryError error={q.error} what="list" onRetry={() => q.refetch()} />}
      {q.data && (
        <>
          <div className="tiles">
            <div className="tile tile-accent">
              <span className="tile-label spread">
                {t('coming')}
                <InfoTip text={t('comingInfo')} />
              </span>
              <span className="tile-value">{fmt.money(q.data.comingCents)}</span>
            </div>
            <Tile label={t('paidMonth')} value={fmt.money(q.data.paidThisMonthCents)} />
            <Tile label={t('paidYear')} value={fmt.money(q.data.paidThisYearCents)} />
          </div>
          <h2 className="section-title">{t('byOrder')}</h2>
          {q.data.orders.length ? (
            <div className="list" style={{ '--cols': COLS } as React.CSSProperties}>
              <div className="list-head" aria-hidden>
                <span>{t('colCustomer')}</span>
                <span>{t('colOrder')}</span>
                <span className="end">{t('colCommission')}</span>
                <span>{t('colStatus')}</span>
                <span />
              </div>
              {q.data.orders.map((o) => (
                <Link key={o.id} href={`/orders/${o.id}`} className="list-row">
                  <span className="cell-main">
                    <span className="strong">{o.customerName}</span>
                    <span className="small muted num phone-only">{o.number} · {o.paidAt ? t('customerPaid', { date: fmt.date(o.paidAt, true) }) : t('notPaidYet')}</span>
                  </span>
                  <span className="cell-main hide-phone">
                    <span className="num">{o.number}</span>
                    <span className="small muted">{o.paidAt ? t('customerPaid', { date: fmt.date(o.paidAt, true) }) : t('notPaidYet')}</span>
                  </span>
                  <span className="end num">{fmt.money(o.commission.grossCents)}</span>
                  <span className="end-phone">
                    <CommissionChip status={o.commissionStatus} />
                  </span>
                  <CaretRight size={16} className="chev" />
                </Link>
              ))}
              <div className="list-foot">{t('footer')}</div>
            </div>
          ) : (
            <div className="card muted">{t('empty')}</div>
          )}
        </>
      )}
    </>
  );
}
