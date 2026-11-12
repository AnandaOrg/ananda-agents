'use client';
import { Suspense, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CaretRight, MagnifyingGlass, Plus, WarningCircle } from '@phosphor-icons/react';
import { parseVat } from '@ananda-agents/shared';
import { useCrumbs, BankBanner } from '../../../components/AppShell';
import { FindPanel } from '../../../components/FindPanel';
import { CustomerStatusChip, Empty, ErrorBox, Loading, Tile } from '../../../components/ui';
import { useCustomers, useErrorText, useFmt } from '../../../lib/hooks';

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
  const errorText = useErrorText();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [find, setFind] = useState<string | null>(params.get('q') && parseVat(params.get('q')!) ? params.get('q') : null);
  useCrumbs([{ label: t('title') }]);

  const filtered = useMemo(() => {
    const list = data.data?.customers ?? [];
    const term = q.trim().toLowerCase().replace(/\s/g, '');
    if (!term) return list;
    return list.filter((c) => c.name.toLowerCase().replace(/\s/g, '').includes(term) || c.vatNumber.toLowerCase().includes(term));
  }, [data.data, q]);

  // One search box (#13): typing filters your list; Search on a VAT number checks the EU register.
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (parseVat(q) || filtered.length === 0) setFind(q.trim());
  };

  const kpi = data.data?.kpi;
  return (
    <>
      <BankBanner />
      {kpi && (
        <>
          <div className="tiles collapse">
            <Tile label={t('latePayments')} value={fmt.money(kpi.lateCents, true)} sub={t('lateCustomers', { n: kpi.lateCustomers })} tone={kpi.lateCents ? 'bad' : undefined} href="/collections" />
            <Tile label={t('dueThisWeek')} value={kpi.dueThisWeekCents ? fmt.money(kpi.dueThisWeekCents, true) : t('nobody')} />
            <Tile label={t('allUnpaid')} value={fmt.money(kpi.unpaidCents, true)} sub={t('sameAsCollections')} />
          </div>
          {kpi.lateCents > 0 && (
            <Link href="/collections" className="lateline">
              <WarningCircle size={22} />
              <span className="cell-main">
                <span className="strong">{t('lateLine', { n: kpi.lateCustomers, amount: fmt.money(kpi.lateCents, true) })}</span>
                <span className="small">{t('tapToCall')}</span>
              </span>
              <CaretRight size={18} className="chev" style={{ marginInlineStart: 'auto' }} />
            </Link>
          )}
        </>
      )}

      <form className="page-head" onSubmit={submit} role="search">
        <div className="search">
          <MagnifyingGlass size={18} />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlaceholder')} aria-label={t('searchPlaceholder')} />
        </div>
        <div className="actions">
          <button className="btn">{t('search')}</button>
          <button type="button" className="btn btn-primary" onClick={() => setFind(parseVat(q) ? q.trim() : '')}>
            <Plus size={18} weight="bold" /> {t('add')}
          </button>
        </div>
      </form>

      <h1 className="title-3" style={{ marginBlockEnd: 12 }}>{t('my', { n: data.data?.customers.length ?? 0 })}</h1>
      {data.isLoading && <Loading />}
      {data.error && <ErrorBox text={errorText(data.error)} onRetry={() => data.refetch()} />}
      {data.data && (
        <div className="list" style={{ '--cols': 'minmax(0,2fr) minmax(0,1.3fr) 120px 170px 20px' } as React.CSSProperties}>
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
                <span className="small subtle num">{c.vatNumber}</span>
              </span>
              <span className="small muted hide-phone">{c.lastOrder ? `${c.lastOrder.number} · ${fmt.date(c.lastOrder.date)}` : t('newCustomer')}</span>
              <span className={`end num ${c.lateCents ? 'bad strong' : c.owesCents ? '' : 'subtle'}`}>{c.owesCents ? fmt.money(c.owesCents) : '—'}</span>
              <span>
                <CustomerStatusChip chip={c.chip} />
              </span>
              <CaretRight size={16} className="chev" />
            </Link>
          ))}
          {!filtered.length && (
            <Empty
              action={
                q.trim() ? (
                  <button className="btn" onClick={() => setFind(q.trim())}>{t('checkRegister', { q: q.trim() })}</button>
                ) : (
                  <button className="btn btn-primary" onClick={() => setFind('')}>{t('add')}</button>
                )
              }
            >
              {q.trim() ? (
                <>
                  {t('noMatch', { q: q.trim() })} {!parseVat(q) && t('noMatchHint')}
                </>
              ) : (
                t('empty')
              )}
            </Empty>
          )}
        </div>
      )}
      <p className="foot-note">{t('footer')}</p>
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
