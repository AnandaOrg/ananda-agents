'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CaretRight, EnvelopeSimple, Phone, Plus } from '@phosphor-icons/react';
import { useCrumbs } from '../../../../components/AppShell';
import { CustomerStatusChip, ErrorBox, Loading, OrderChip } from '../../../../components/ui';
import { useCustomer, useErrorText, useFmt } from '../../../../lib/hooks';

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations();
  const fmt = useFmt();
  const errorText = useErrorText();
  const q = useCustomer(id);
  const c = q.data;
  useCrumbs([{ label: t('customers.title'), href: '/customers' }, { label: c?.name ?? '…' }]);

  if (q.isLoading) return <Loading />;
  if (q.error || !c) return <ErrorBox text={errorText(q.error)} onRetry={() => q.refetch()} />;

  const chip = c.status === 'waiting_for_approval' ? { kind: 'waiting_for_approval' as const } : c.status === 'rejected' ? { kind: 'rejected' as const } : null;
  return (
    <div className="stack">
      <div className="page-head" style={{ margin: 0 }}>
        <div className="stack-sm">
          <h1 className="title-1">{c.name}</h1>
          <div className="row-flex muted small" style={{ flexWrap: 'wrap' }}>
            {c.number && <span className="num">{c.number}</span>}
            <span className="num">{c.vatNumber}</span>
            {chip && <CustomerStatusChip chip={chip} />}
          </div>
        </div>
        {c.status === 'active' && (
          <Link href={`/sales/new?customer=${c.id}`} className="btn btn-primary">
            <Plus size={18} weight="bold" /> {t('nav.newSale')}
          </Link>
        )}
      </div>

      {c.status === 'waiting_for_approval' && <div className="banner banner-blue">{t('customer.waiting')}</div>}
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
          <h2 className="title-3">{t('customer.orders')}</h2>
          {c.orders.length === 0 ? (
            <div className="card muted">{t('customer.noOrders')}</div>
          ) : (
            <div className="list" style={{ '--cols': 'minmax(0,1fr) 120px 150px 20px' } as React.CSSProperties}>
              {c.orders.map((o) => (
                <Link key={o.id} href={`/orders/${o.id}`} className="list-row">
                  <span className="cell-main">
                    <span className="strong num">{o.number}</span>
                    <span className="small subtle">{fmt.date(o.orderedAt, true)} · {t('common.cartons', { n: o.cartons })}</span>
                  </span>
                  <span className="end num">{fmt.money(o.totalCents)}</span>
                  <span>
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
            <span className="overline">{t('customer.contact')}</span>
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
    </div>
  );
}
