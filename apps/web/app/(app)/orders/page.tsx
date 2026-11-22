'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CaretRight, MagnifyingGlass, Plus, SlidersHorizontal } from '@phosphor-icons/react';
import { isoDate, type OrderDisplayStatus, type OrderRow } from '@ananda-agents/shared';
import { useCrumbs } from '../../../components/AppShell';
import { OrderChip, PageHeader, Panel, QueryError, SkeletonRows } from '../../../components/ui';
import { useFmt, useOrders } from '../../../lib/hooks';

type Period = 'any' | 'month' | 'quarter';
/** Brokers see five groups (decision 7): paid, at the warehouse, delivered and invoiced are one "Delivered · paid". */
type Group = 'all' | 'waiting_for_payment' | 'late' | 'done' | 'cancelled';
const GROUPS: Group[] = ['all', 'waiting_for_payment', 'late', 'done', 'cancelled'];
const groupOf = (s: OrderDisplayStatus): Exclude<Group, 'all'> => (s === 'late' || s === 'waiting_for_payment' || s === 'cancelled' ? s : 'done');
interface Filters {
  group: Group;
  customer: string;
  period: Period;
}
const NONE: Filters = { group: 'all', customer: 'all', period: 'any' };
const COLS = 'minmax(0,1.8fr) 130px 80px 130px minmax(150px,1fr) 20px';

function apply(rows: OrderRow[], f: Filters, q: string) {
  const now = new Date();
  const monthStart = isoDate(now).slice(0, 7);
  const quarterStart = isoDate(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()));
  const term = q.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (f.group === 'all' || groupOf(r.status) === f.group) &&
      (f.customer === 'all' || r.customerId === f.customer) &&
      (f.period === 'any' || (f.period === 'month' ? isoDate(r.orderedAt).startsWith(monthStart) : isoDate(r.orderedAt) >= quarterStart)) &&
      (!term || r.customerName.toLowerCase().includes(term) || r.number.toLowerCase().includes(term)),
  );
}

function useGroupLabel() {
  const t = useTranslations();
  return (g: Group) => (g === 'all' ? t('filters.all') : g === 'late' ? t('status.lateFilter') : g === 'done' ? t('filters.done') : t(`status.${g}`));
}

export default function OrdersPage() {
  const t = useTranslations();
  const fmt = useFmt();
  const orders = useOrders();
  const label = useGroupLabel();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Filters>(NONE);
  const [open, setOpen] = useState(false);
  useCrumbs([{ label: t('orders.title') }]);

  const rows = orders.data ?? [];
  const shown = useMemo(() => apply(rows, filters, q), [rows, filters, q]);
  const active = (filters.group !== 'all' ? 1 : 0) + (filters.customer !== 'all' ? 1 : 0) + (filters.period !== 'any' ? 1 : 0);
  const count = (g: Group) => apply(rows, { ...filters, group: g }, q).length;
  const customers = [...new Map(rows.map((r) => [r.customerId, r.customerName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));

  const search = (
    <div className="search" style={{ minWidth: 240 }}>
      <MagnifyingGlass size={18} />
      <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('orders.searchPlaceholder')} aria-label={t('orders.searchPlaceholder')} />
    </div>
  );

  return (
    <>
      <PageHeader
        title={t('orders.title')}
        date sub={orders.data ? t('orders.count', { n: rows.length }) : undefined}
        actions={
          <>
            <span className="desk-only" style={{ display: 'contents' }}>{search}</span>
            <Link href="/sales/new" className="btn btn-primary btn-sm desk-only">
              <Plus size={16} weight="bold" /> {t('nav.newSale')}
            </Link>
            <button className="icon-btn phone-only" onClick={() => setOpen(true)} aria-label={t('orders.filters')}>
              <SlidersHorizontal size={18} />
              {active > 0 && <span className="count" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>{active}</span>}
            </button>
          </>
        }
      />
      <div className="phone-only" style={{ marginBlockEnd: 'var(--section-gap)', width: '100%' }}>{search}</div>

      <div className="row-flex desk-only" style={{ marginBlockEnd: 'var(--section-gap)', alignItems: 'stretch' }}>
        <div className="chip-row grow" role="group" aria-label={t('filters.status')}>
          {GROUPS.map((g) => (
            <button key={g} aria-pressed={filters.group === g} onClick={() => setFilters({ ...filters, group: g })}>
              {label(g)} <span className="n">· {count(g)}</span>
            </button>
          ))}
        </div>
        <select className="select" style={{ width: 'auto', minHeight: 'var(--control-sm)', borderRadius: 'var(--radius-full)' }} value={filters.customer} onChange={(e) => setFilters({ ...filters, customer: e.target.value })} aria-label={t('filters.customer')}>
          <option value="all">{t('filters.allCustomers', { n: rows.length })}</option>
          {customers.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
      </div>

      {orders.isLoading && <SkeletonRows cols={COLS} values={4} />}
      {orders.error && <QueryError error={orders.error} what="list" onRetry={() => orders.refetch()} />}
      {orders.data && shown.length > 0 && (
        <div className="list" style={{ '--cols': COLS } as React.CSSProperties}>
          <div className="list-head" aria-hidden>
            <span>{t('orders.colCustomer')}</span>
            <span>{t('orders.colOrdered')}</span>
            <span className="center">{t('orders.colUnits')}</span>
            <span className="end">{t('orders.colTotal')}</span>
            <span>{t('orders.colStatus')}</span>
            <span />
          </div>
          {shown.map((o) => (
            <Link key={o.id} href={`/orders/${o.id}`} className="list-row">
              <span className="cell-main">
                <span className="strong">{o.customerName}</span>
                <span className="small muted num">
                  {o.number}
                  <span className="phone-only"> · {fmt.date(o.orderedAt, true)}</span>
                </span>
              </span>
              <span className="num hide-phone">{fmt.date(o.orderedAt, true)}</span>
              <span className="center num hide-phone">{fmt.num(o.units)}</span>
              <span className="end num">{fmt.money(o.totalCents)}</span>
              <span className="end-phone">
                <OrderChip status={o.status} daysLate={o.daysLate} />
              </span>
              <CaretRight size={16} className="chev" />
            </Link>
          ))}
        </div>
      )}
      {orders.data && !shown.length && (
        <div className="card stack-sm">
          <span className="strong">{rows.length ? t('orders.empty') : t('orders.emptyAll')}</span>
          <span>
            {rows.length ? (
              <button className="btn btn-sm" onClick={() => { setFilters(NONE); setQ(''); }}>{t('orders.clearFilters')}</button>
            ) : (
              <Link className="btn btn-primary btn-sm" href="/sales/new">{t('nav.newSale')}</Link>
            )}
          </span>
        </div>
      )}
      {open && <FiltersPanel rows={rows} q={q} initial={filters} onApply={(f) => { setFilters(f); setOpen(false); }} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Screen 8 (below 768): one Filters sheet with a live count before applying (#10). */
function FiltersPanel({ rows, q, initial, onApply, onClose }: { rows: OrderRow[]; q: string; initial: Filters; onApply: (f: Filters) => void; onClose: () => void }) {
  const t = useTranslations();
  const label = useGroupLabel();
  const [f, setF] = useState(initial);
  const count = apply(rows, f, q).length;
  const customers = [...new Map(rows.map((r) => [r.customerId, r.customerName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
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
      {count === 0 && <p className="muted">{t('filters.nothing')}</p>}
      <label className="field">
        <span className="label overline">{t('filters.status')}</span>
        <select className="select" value={f.group} onChange={(e) => setF({ ...f, group: e.target.value as Group })}>
          {GROUPS.map((g) => (
            <option key={g} value={g}>
              {label(g)} · {apply(rows, { ...f, group: g }, q).length}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label overline">{t('filters.customer')}</span>
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
        <span className="label overline">{t('filters.when')}</span>
        <div className="chip-row" role="group" aria-label={t('filters.when')}>
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
