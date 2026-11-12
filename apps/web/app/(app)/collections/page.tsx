'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CollectionRow } from '@ananda-agents/shared';
import { useCrumbs } from '../../../components/AppShell';
import { ChaseActions } from '../../../components/ChaseActions';
import { Empty, ErrorBox, Loading, OrderChip, Tile } from '../../../components/ui';
import { useCollections, useErrorText, useFmt } from '../../../lib/hooks';

export default function CollectionsPage() {
  const t = useTranslations('collections');
  const tc = useTranslations('customers');
  const fmt = useFmt();
  const errorText = useErrorText();
  const q = useCollections();
  useCrumbs([{ label: t('title') }]);
  if (q.isLoading) return <Loading />;
  if (!q.data) return <ErrorBox text={errorText(q.error)} onRetry={() => q.refetch()} />;
  const { kpi, late, dueSoon } = q.data;
  return (
    <>
      <h1 className="title-1" style={{ marginBlockEnd: 16 }}>{t('title')}</h1>
      <div className="tiles">
        <Tile label={t('latePayments')} value={fmt.money(kpi.lateCents, true)} sub={tc('lateCustomers', { n: kpi.lateCustomers })} tone={kpi.lateCents ? 'bad' : undefined} />
        <Tile label={t('dueThisWeek')} value={fmt.money(kpi.dueThisWeekCents, true)} />
        <Tile label={t('remindersSent')} value={kpi.remindersSent} sub={t('adminsCopied')} />
      </div>
      <section className="stack-sm" style={{ marginBlockEnd: 24 }}>
        <h2 className="title-3">{t('late')}</h2>
        {late.length ? <Rows rows={late} /> : <div className="card muted">{t('noLate')}</div>}
      </section>
      <section className="stack-sm">
        <h2 className="title-3">{t('dueSoon')}</h2>
        {dueSoon.length ? <Rows rows={dueSoon} /> : <div className="card muted">{t('noDue')}</div>}
      </section>
      <p className="foot-note">{t('rule')}</p>
    </>
  );
}

function Rows({ rows }: { rows: CollectionRow[] }) {
  const t = useTranslations('collections');
  const fmt = useFmt();
  if (!rows.length) return <Empty>{t('noLate')}</Empty>;
  return (
    <div className="list" style={{ '--cols': 'minmax(0,1.6fr) 150px 120px minmax(0,1.7fr)' } as React.CSSProperties}>
      {rows.map((r) => (
        <div key={r.id} className="list-row" style={{ paddingBlock: 10 }}>
          <Link href={`/orders/${r.id}`} className="cell-main">
            <span className="strong">{r.customerName}</span>
            <span className="small subtle num">
              {r.number} · {r.status === 'late' ? (r.lastReminderAt ? t('lastReminder', { date: fmt.date(r.lastReminderAt) }) : t('noReminder')) : t('dueOn', { date: fmt.date(r.dueDate) })}
            </span>
          </Link>
          <span>
            <OrderChip status={r.status} daysLate={r.daysLate} />
          </span>
          <span className={`end num strong ${r.status === 'late' ? 'bad' : ''}`}>{fmt.money(r.totalCents)}</span>
          <span style={{ gridColumn: 'auto', justifySelf: 'end' }}>
            <ChaseActions orderId={r.id} number={r.number} customerName={r.customerName} phone={r.phone} email={r.email} />
          </span>
        </div>
      ))}
    </div>
  );
}
