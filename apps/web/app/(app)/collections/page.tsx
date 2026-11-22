'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CollectionRow } from '@ananda-agents/shared';
import { useCrumbs } from '../../../components/AppShell';
import { ChaseActions } from '../../../components/ChaseActions';
import { OrderChip, PageHeader, QueryError, SkeletonRows, SkeletonTiles, Tile } from '../../../components/ui';
import { useCollections, useFmt } from '../../../lib/hooks';

const COLS = 'minmax(0,1.6fr) minmax(120px,0.8fr) minmax(110px,0.6fr) auto';

/** Screen 10: who owes, how late, and one "Get in touch" per row (Call, E-mail, Remind). */
export default function CollectionsPage() {
  const t = useTranslations('collections');
  const tc = useTranslations('customers');
  const fmt = useFmt();
  const q = useCollections();
  useCrumbs([{ label: t('title') }]);
  const line = q.data ? (q.data.kpi.lateCents ? tc('lateLine', { n: q.data.kpi.lateCustomers, amount: fmt.money(q.data.kpi.lateCents, true) }) : t('noLate')) : undefined;
  return (
    <>
      <PageHeader title={t('title')} date sub={line} />
      {q.isLoading ? (
        <>
          <SkeletonTiles n={3} />
          <SkeletonRows cols={COLS} values={3} />
        </>
      ) : !q.data ? (
        <QueryError error={q.error} what="list" onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="tiles">
            <Tile label={t('latePayments')} value={fmt.money(q.data.kpi.lateCents, true)} sub={q.data.kpi.lateCents ? tc('lateCustomers', { n: q.data.kpi.lateCustomers }) : t('nobody')} tone={q.data.kpi.lateCents ? 'bad' : undefined} />
            <Tile label={t('dueThisWeek')} value={fmt.money(q.data.kpi.dueThisWeekCents, true)} sub={q.data.dueSoon.length ? undefined : t('nobody')} />
            <Tile label={t('remindersSent')} value={q.data.kpi.remindersSent} sub={t('adminsCopied')} />
          </div>
          <section style={{ marginBlockEnd: 'var(--section-gap)' }}>
            <h2 className="section-title">{t('late')} · {q.data.late.length}</h2>
            {q.data.late.length ? <Rows rows={q.data.late} foot={t('rule')} /> : <div className="card muted">{t('noLate')}</div>}
          </section>
          <section>
            <h2 className="section-title">{t('dueSoon')} · {q.data.dueSoon.length}</h2>
            {q.data.dueSoon.length ? <Rows rows={q.data.dueSoon} /> : <div className="card muted">{t('noDue')}</div>}
          </section>
        </>
      )}
    </>
  );
}

function Rows({ rows, foot }: { rows: CollectionRow[]; foot?: string }) {
  const t = useTranslations('collections');
  const fmt = useFmt();
  return (
    <div className="list" style={{ '--cols': COLS } as React.CSSProperties}>
      <div className="list-head">
        <span>{t('customer')}</span>
        <span>{t('status')}</span>
        <span className="end">{t('amount')}</span>
        <span className="sr-only">{t('actions')}</span>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="list-row">
          <Link href={`/orders/${r.id}`} className="cell-main">
            <span className="strong">{r.customerName}</span>
            <span className="small muted num">
              {r.number} · {r.status === 'late' ? (r.lastReminderAt ? t('lastReminder', { date: fmt.date(r.lastReminderAt) }) : t('noReminder')) : t('dueOn', { date: fmt.date(r.dueDate) })}
            </span>
          </Link>
          <span className="end-phone">
            <OrderChip status={r.status} daysLate={r.daysLate} />
          </span>
          <span className="end num strong">{fmt.money(r.totalCents)}</span>
          <span className="end">
            <ChaseActions variant="menu" orderId={r.id} number={r.number} customerName={r.customerName} phone={r.phone} email={r.email} />
          </span>
        </div>
      ))}
      {foot && <div className="list-foot">{foot}</div>}
    </div>
  );
}
