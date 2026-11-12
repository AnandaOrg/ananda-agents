'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CaretRight, Funnel, MagnifyingGlass, Plus } from '@phosphor-icons/react';
import { isoDate, type OrderDisplayStatus, type OrderRow } from '@ananda-agents/shared';
import { useCrumbs } from '../../../components/AppShell';
import { Empty, ErrorBox, Loading, OrderChip, Panel } from '../../../components/ui';
import { useErrorText, useFmt, useOrders } from '../../../lib/hooks';

type Period = 'any' | 'month' | 'quarter';
interface Filters {
  status: OrderDisplayStatus | 'all';
  customer: string;
  period: Period;
}
const NONE: Filters = { status: 'all', customer: 'all', period: 'any' };
const STATUS_OPTIONS: OrderDisplayStatus[] = ['late', 'waiting_for_payment', 'paid', 'sent_to_warehouse', 'delivered', 'invoice_issued', 'cancelled'];

function apply(rows: OrderRow[], f: Filters, q: string) {
  const now = new Date();
  const monthStart = isoDate(now).slice(0, 7);
  const quarterStart = isoDate(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()));
  const term = q.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (f.status === 'all' || r.status === f.status) &&
      (f.customer === 'all' || r.customerId === f.customer) &&
      (f.period === 'any' || (f.period === 'month' ? isoDate(r.orderedAt).startsWith(monthStart) : isoDate(r.orderedAt) >= quarterStart)) &&
      (!term || r.customerName.toLowerCase().includes(term) || r.number.toLowerCase().includes(term)),
  );
}

export default function OrdersPage() {
  const t = useTranslations();
  const fmt = useFmt();
  const errorText = useErrorText();
  const orders = useOrders();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Filters>(NONE);
  const [open, setOpen] = useState(false);
  useCrumbs([{ label: t('orders.title') }]);

  const rows = orders.data ?? [];
  const shown = useMemo(() => apply(rows, filters, q), [rows, filters, q]);
  const active = (filters.status !== 'all' ? 1 : 0) + (filters.customer !== 'all' ? 1 : 0) + (filters.period !== 'any' ? 1 : 0);

  return (
    <>
      <div className="page-head">
        <div className="cell-main">
          <h1 className="title-1">{t('orders.title')}</h1>
          <span className="muted">{t('orders.count', { n: rows.length })}</span>
        </div>
        <Link href="/sales/new" className="btn btn-primary">
          <Plus size={18} weight="bold" /> {t('nav.newSale')}
        </Link>
      </div>
      <div className="page-head">
        <div className="search">
          <MagnifyingGlass size={18} />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('orders.searchPlaceholder')} aria-label={t('orders.searchPlaceholder')} />
        </div>
        <button className="btn" onClick={() => setOpen(true)}>
          <Funnel size={18} /> {t('orders.filters')}
          {active > 0 && <span className="badge" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>{active}</span>}
        </button>
      </div>

      {orders.isLoading && <Loading />}
      {orders.error && <ErrorBox text={errorText(orders.error)} onRetry={() => orders.refetch()} />}
      {orders.data && (
        <div className="list" style={{ '--cols': 'minmax(0,2fr) 110px 90px 130px 160px 20px' } as React.CSSProperties}>
          <div className="list-head" aria-hidden>
            <span>{t('orders.colCustomer')}</span>
            <span>{t('orders.colOrdered')}</span>
            <span className="end">{t('orders.colUnits')}</span>
            <span className="end">{t('orders.colTotal')}</span>
            <span>{t('orders.colStatus')}</span>
            <span />
          </div>
          {shown.map((o) => (
            <Link key={o.id} href={`/orders/${o.id}`} className="list-row">
              <span className="cell-main">
                <span className="strong">{o.customerName}</span>
                <span className="small subtle num">{o.number}</span>
              </span>
              <span className="small muted hide-phone">{fmt.date(o.orderedAt, true)}</span>
              <span className="end num muted hide-phone">{fmt.num(o.units)}</span>
              <span className="end num">{fmt.money(o.totalCents)}</span>
              <span>
                <OrderChip status={o.status} daysLate={o.daysLate} />
              </span>
              <CaretRight size={16} className="chev" />
            </Link>
          ))}
          {!shown.length && (
            <Empty action={rows.length ? <button className="btn" onClick={() => { setFilters(NONE); setQ(''); }}>{t('orders.clearFilters')}</button> : <Link className="btn btn-primary" href="/sales/new">{t('nav.newSale')}</Link>}>
              {rows.length ? t('orders.empty') : t('orders.emptyAll')}
            </Empty>
          )}
        </div>
      )}
      {open && <FiltersPanel rows={rows} q={q} initial={filters} onApply={(f) => { setFilters(f); setOpen(false); }} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Screen 8: one Filters drawer replaces dropdowns and counters (#10); the count is live before applying. */
function FiltersPanel({ rows, q, initial, onApply, onClose }: { rows: OrderRow[]; q: string; initial: Filters; onApply: (f: Filters) => void; onClose: () => void }) {
  const t = useTranslations();
  const [f, setF] = useState(initial);
  const count = apply(rows, f, q).length;
  const customers = [...new Map(rows.map((r) => [r.customerId, r.customerName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const statusLabel = (s: OrderDisplayStatus) => (s === 'late' ? t('status.lateFilter') : t(`status.${s}`));
  return (
    <Panel
      title={t('filters.title')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={() => setF(NONE)}>{t('filters.clear')}</button>
          <button className="btn btn-primary" onClick={() => onApply(f)} disabled={count === 0}>{t('filters.show', { n: count })}</button>
        </>
      }
    >
      <label className="field">
        <span className="label">{t('filters.status')}</span>
        <select className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Filters['status'] })}>
          <option value="all">{t('filters.allStatuses', { n: rows.length })}</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)} · {rows.filter((r) => r.status === s).length}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label">{t('filters.customer')}</span>
        <select className="select" value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })}>
          <option value="all">{t('filters.allCustomers', { n: rows.length })}</option>
          {customers.map(([id, name]) => (
            <option key={id} value={id}>
              {name} · {rows.filter((r) => r.customerId === id).length}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        <span className="label">{t('filters.when')}</span>
        <div className="seg" role="group">
          {(['any', 'month', 'quarter'] as Period[]).map((p) => (
            <button key={p} aria-pressed={f.period === p} onClick={() => setF({ ...f, period: p })}>
              {t(`filters.${p}`)}
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}
