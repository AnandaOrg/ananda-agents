'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CaretRight, EnvelopeSimple, Phone, Plus } from '@phosphor-icons/react';
import { useCrumbs } from '../../../../components/AppShell';
import { CustomerStatusChip, Loading, OrderChip, PageHeader, QueryError } from '../../../../components/ui';
import { useCustomer, useFmt } from '../../../../lib/hooks';

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations();
  const fmt = useFmt();
  const q = useCustomer(id);
  const c = q.data;
  useCrumbs([{ label: t('customers.title'), href: '/customers' }, { label: c?.name ?? '…' }]);

  if (q.isLoading) return <Loading />;
  if (q.error || !c) return <QueryError error={q.error} onRetry={() => q.refetch()} back={{ href: '/customers', label: t('states.backToCustomers') }} />;

  const chip = c.status === 'waiting_for_approval' ? { kind: 'waiting_for_approval' as const } : c.status === 'rejected' ? { kind: 'rejected' as const } : null;
  return (
    <>
      <PageHeader
        back="/customers"
        title={c.name}
        line={
          <span className="row-flex" style={{ flexWrap: 'wrap', gap: 8 }}>
            {c.number && <span className="num">{c.number}</span>}
            <span className="num">{c.vatNumber}</span>
            {chip && <CustomerStatusChip chip={chip} />}
          </span>
        }
        actions={
          c.status === 'active' && (
            <Link href={`/sales/new?customer=${c.id}`} className="btn btn-primary btn-sm">
              <Plus size={16} weight="bold" /> {t('nav.newSale')}
            </Link>
          )
        }
      />

      {c.status === 'waiting_for_approval' && <div className="banner banner-grey">{t('customer.waiting')}</div>}
      {c.status === 'rejected' && (
        <div className="banner banner-grey">
          <span className="grow">
            <span className="strong">{t('customer.rejected')}</span>
            {c.rejectedReason && <span className="muted"> · {t('customer.rejectedReason', { reason: c.rejectedReason })}</span>}
          </span>
        </div>
      )}

      <div className="grid-2">
        <section className="stack-sm">
          <h2 className="section-title" style={{ margin: 0 }}>{t('customer.orders')}</h2>
          {c.orders.length === 0 ? (
            <div className="card muted">{t('customer.noOrders')}</div>
          ) : (
            <div className="list" style={{ '--cols': 'minmax(0,1fr) 120px 150px 20px' } as React.CSSProperties}>
              {c.orders.map((o) => (
                <Link key={o.id} href={`/orders/${o.id}`} className="list-row">
                  <span className="cell-main">
                    <span className="strong num">{o.number}</span>
                    <span className="small muted">{fmt.date(o.orderedAt, true)} · {t('common.cartons', { n: o.cartons })}</span>
                  </span>
                  <span className="end num">{fmt.money(o.totalCents)}</span>
                  <span className="end-phone">
                    <OrderChip status={o.status} daysLate={o.daysLate} />
                  </span>
                  <CaretRight size={16} className="chev" />
                </Link>
              ))}
            </div>
          )}
        </section>
        <aside className="stack">
          <section className="card stack-sm">
            <h2 className="section-title" style={{ margin: 0 }}>{t('customer.contact')}</h2>
            <div className="strong">{c.contactName ?? '—'}</div>
            <div className="actions">
              {c.phone && (
                <a className="btn btn-sm" href={`tel:${c.phone.replace(/\s/g, '')}`}>
                  <Phone size={16} /> {c.phone}
                </a>
              )}
              {c.email && (
                <a className="btn btn-sm" href={`mailto:${c.email}`}>
                  <EnvelopeSimple size={16} /> {c.email}
                </a>
              )}
            </div>
          </section>
          <section className="card">
            <dl className="kv">
              <dt>{t('newCustomer.billing')}</dt>
              <dd>{c.billingAddress}</dd>
              <dt>{t('newCustomer.delivery')}</dt>
              <dd>{c.deliveryAddress ?? t('common.sameAsBilling')}</dd>
              <dt>{t('customer.terms')}</dt>
              <dd>{c.paymentTermsDays ? t('common.dueInDays', { n: c.paymentTermsDays }) : t('common.dueOnReceipt')}</dd>
              <dt>VAT</dt>
              <dd>{c.reverseCharge ? t('common.reverseCharge') : t('common.vat20')}</dd>
            </dl>
            {c.status === 'active' && <p className="hint" style={{ marginBlockStart: 12 }}>{c.ownedUntil ? t('customer.ownedUntil', { date: fmt.date(c.ownedUntil, true) }) : t('customer.ownedNoOrders')}</p>}
          </section>
        </aside>
      </div>
    </>
  );
}
