'use client';
import { Suspense, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CaretRight, MagnifyingGlass, Plus, UserPlus, WarningCircle } from '@phosphor-icons/react';
import { parseVat } from '@ananda-agents/shared';
import { useCrumbs, BankBanner } from '../../../components/AppShell';
import { FindPanel } from '../../../components/FindPanel';
import { CustomerStatusChip, PageHeader, QueryError, SkeletonRows, SkeletonTiles, Tile } from '../../../components/ui';
import { useCustomers, useFmt } from '../../../lib/hooks';

const COLS = 'minmax(0,1.6fr) minmax(0,1.2fr) 130px minmax(150px,0.9fr) 20px';

export default function CustomersPage() {
  return (
    <Suspense>
      <Customers />
    </Suspense>
  );
}

function Customers() {
  const t = useTranslations('customers');
  const fmt = useFmt();
  const router = useRouter();
  const params = useSearchParams();
  const data = useCustomers();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [find, setFind] = useState<string | null>(params.get('q') && parseVat(params.get('q')!) ? params.get('q') : null);
  useCrumbs([{ label: t('title') }]);

  const filtered = useMemo(() => {
    const list = data.data?.customers ?? [];
    const term = q.trim().toLowerCase().replace(/\s/g, '');
    if (!term) return list;
    return list.filter((c) => c.name.toLowerCase().replace(/\s/g, '').includes(term) || c.vatNumber.toLowerCase().includes(term));
  }, [data.data, q]);

  // One search box (#13): typing filters your list; Enter on a VAT number checks the EU register.
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (parseVat(q) && filtered.length === 0) setFind(q.trim());
  };
  const addFromSearch = () => setFind(parseVat(q) ? q.trim() : '');

  const kpi = data.data?.kpi;
  const term = q.trim();
  return (
    <>
      <PageHeader
        title={t('title')}
        date sub={t('yoursFor')}
        actions={
          <button type="button" className="btn btn-primary btn-sm" onClick={addFromSearch}>
            <Plus size={16} weight="bold" /> {t('add')}
          </button>
        }
      />
      <BankBanner />
      {data.isLoading && <SkeletonTiles n={3} />}
      {kpi && (
        <>
          <div className="tiles collapse">
            <Tile label={t('latePayments')} value={fmt.money(kpi.lateCents, true)} sub={kpi.lateCents ? t('lateCustomers', { n: kpi.lateCustomers }) : t('nobody')} tone={kpi.lateCents ? 'bad' : undefined} href="/collections" />
            <Tile label={t('dueThisWeek')} value={fmt.money(kpi.dueThisWeekCents, true)} sub={kpi.dueThisWeekCents ? undefined : t('nobody')} />
            <Tile label={t('allUnpaid')} value={fmt.money(kpi.unpaidCents, true)} sub={t('sameAsCollections')} />
          </div>
          {kpi.lateCents > 0 && (
            <Link href="/collections" className="lateline">
              <WarningCircle size={20} />
              <span className="cell-main">
                <span className="strong">{t('lateLine', { n: kpi.lateCustomers, amount: fmt.money(kpi.lateCents, true) })}</span>
                <span className="small muted">{t('tapToCall')}</span>
              </span>
              <CaretRight size={16} className="chev flip" style={{ marginInlineStart: 'auto' }} />
            </Link>
          )}
        </>
      )}

      <form onSubmit={submit} role="search" style={{ marginBlockEnd: 'var(--section-gap)' }}>
        <div className="search">
          <MagnifyingGlass size={18} />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlaceholder')} aria-label={t('searchPlaceholder')} type="search" />
        </div>
      </form>

      <h2 className="section-title">{t('my', { n: data.data?.customers.length ?? 0 })}</h2>
      {data.isLoading && <SkeletonRows cols={COLS} values={3} />}
      {data.error && <QueryError error={data.error} what="list" onRetry={() => data.refetch()} />}
      {data.data && filtered.length > 0 && (
        <div className="list" style={{ '--cols': COLS } as React.CSSProperties}>
          <div className="list-head" aria-hidden>
            <span>{t('colCustomer')}</span>
            <span>{t('colLastOrder')}</span>
            <span className="end">{t('colOwes')}</span>
            <span>{t('colStatus')}</span>
            <span />
          </div>
          {filtered.map((c) => (
            <Link key={c.id} href={`/customers/${c.id}`} className="list-row">
              <span className="cell-main">
                <span className="strong">{c.name}</span>
                <span className="small muted num phone-only">{c.lastOrder ? t('lastOrderOn', { date: fmt.date(c.lastOrder.date, true) }) : t('newCustomer')}</span>
              </span>
              <span className="num hide-phone">{c.lastOrder ? `${c.lastOrder.number} · ${fmt.date(c.lastOrder.date, true)}` : <span className="muted">{t('newCustomer')}</span>}</span>
              <span className={`end num ${c.lateCents ? 'bad' : c.owesCents ? '' : 'subtle'}`}>{c.owesCents ? fmt.money(c.owesCents) : '—'}</span>
              <span className="end-phone">
                <CustomerStatusChip chip={c.chip} />
              </span>
              <CaretRight size={16} className="chev" />
            </Link>
          ))}
          <div className="list-foot">{t('footer')}</div>
        </div>
      )}
      {data.data && !filtered.length && (
        <div className="card stack-sm">
          <span className="strong">{term ? (parseVat(term) ? t('noMatchVat') : t('noMatchName')) : t('empty')}</span>
          <span className="muted">{t('notYoursYet')}</span>
          <button className="btn btn-block" style={{ marginBlockStart: 8 }} onClick={addFromSearch}>
            <UserPlus size={16} /> {t('addAsNew')}
          </button>
        </div>
      )}
      {find !== null && (
        <FindPanel
          initialQuery={find}
          onClose={() => {
            setFind(null);
            if (params.get('q')) router.replace('/customers');
          }}
        />
      )}
    </>
  );
}
