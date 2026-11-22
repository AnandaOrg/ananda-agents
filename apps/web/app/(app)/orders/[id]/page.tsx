'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChatCircleText, Check, FilePdf, Warning } from '@phosphor-icons/react';
import { FLAVOUR_NAMES, LANGUAGE_NAMES, type OrderDetail } from '@ananda-agents/shared';
import { useCrumbs } from '../../../../components/AppShell';
import { ChaseActions } from '../../../../components/ChaseActions';
import { FlavourDot, Loading, PageHeader, Panel, QueryError, Spinner } from '../../../../components/ui';
import { useToast } from '../../../../components/toast';
import { post } from '../../../../lib/api';
import { keys, useErrorText, useFmt, useOrder } from '../../../../lib/hooks';

/** Screen 9: one page instead of nine (#1); status and next action first, no warehouse codes or Admin warnings. */
export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations();
  const fmt = useFmt();
  const q = useOrder(id);
  const [correction, setCorrection] = useState(false);
  useCrumbs([{ label: t('orders.title'), href: '/orders' }, { label: q.data ? q.data.customerName : '…' }]);
  if (q.isLoading) return <Loading />;
  if (!q.data) return <QueryError error={q.error} onRetry={() => q.refetch()} back={{ href: '/orders', label: t('states.backToOrders') }} />;
  const o = q.data;
  const unpaid = o.status === 'late' || o.status === 'waiting_for_payment';

  return (
    <>
      <PageHeader back="/orders" title={o.customerName} line={<span className="num">{t('order.meta', { number: o.number, date: fmt.date(o.orderedAt, true), agent: o.agentName })}</span>} />

      <StatusBanner o={o} />
      {o.emailFailed && (
        <div className="banner banner-warn">
          <Warning size={20} />
          <span className="grow">{t('order.emailFailed')}</span>
        </div>
      )}

      <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)' }}>
        <div className="stack">
          <section className="card stack">
            <h2 className="section-title" style={{ margin: 0 }}>{t('order.progress')}</h2>
            <Progress o={o} />
          </section>
          <div className="actions-equal">
            <a className="btn btn-sm" href={`/api/orders/${o.id}/proforma.pdf`} target="_blank" rel="noreferrer">
              <FilePdf size={16} /> {t('order.pdf')}
            </a>
            <button className="btn btn-sm" onClick={() => setCorrection(true)}>
              <ChatCircleText size={16} /> {t('order.correction')}
            </button>
          </div>
          <span className="hint">
            {t('order.language', { lang: LANGUAGE_NAMES[o.language] })}
            {unpaid && ` · ${t('order.reminders', { n: o.reminders })}`}
            {unpaid && o.lastReminderAt && ` · ${t('order.lastReminder', { date: fmt.date(o.lastReminderAt, true) })}`}
          </span>
        </div>

        <div className="stack">
          <section className="card stack">
            <h2 className="section-title" style={{ margin: 0 }}>{t('order.ordered')}</h2>
            <div className="stack-sm">
              {o.lines.map((l) => (
                <div key={l.flavour} className="spread">
                  <span className="row-flex" style={{ gap: 10 }}>
                    <FlavourDot flavour={l.flavour} />
                    <span className="flavour-name">{FLAVOUR_NAMES[l.flavour]}</span>
                    <span className="muted small">{t('common.cartons', { n: l.cartons })}</span>
                  </span>
                  <span className="num">{fmt.money(l.lineNetCents)}</span>
                </div>
              ))}
            </div>
            <dl className="kv">
              <dt>{t('review.net')}</dt>
              <dd>{fmt.money(o.netCents)}</dd>
              <dt>{t('review.vat', { rate: o.reverseCharge ? t('common.reverseCharge') : t('common.vat20') })}</dt>
              <dd>{fmt.money(o.vatCents)}</dd>
              <dt className="total">{t('review.total')}</dt>
              <dd className="total">{fmt.money(o.totalCents)}</dd>
            </dl>
            {o.discounted && <span><span className="tag tag-accent">{t('order.discounted')} · {fmt.money(o.unitPriceCents)}</span></span>}
            <div className="small muted stack-sm" style={{ gap: 2 }}>
              <span>{t('order.delivery')}: {o.deliveryAddress}</span>
              {o.deliveryInstructions && <span>{o.deliveryInstructions}</span>}
            </div>
          </section>

          <section className="card stack-sm">
            <div className="spread">
              <h2 className="section-title" style={{ margin: 0 }}>{t('order.yourCommission')}</h2>
              {o.commissionStatus !== 'none' && <span className="title-3 num accent">{fmt.money(o.commission.grossCents)}</span>}
            </div>
            {o.commissionStatus === 'none' ? (
              <p className="muted">{t('order.noCommission')}</p>
            ) : (
              <>
                <span className="muted num">{t('common.plusVat', { net: fmt.money(o.commission.netCents), vat: fmt.money(o.commission.vatCents), gross: fmt.money(o.commission.grossCents) })}</span>
                <span className="small muted">{o.closedAt ? t('order.commissionPaidOn', { date: fmt.date(o.closedAt, true) }) : t('order.paidWhenCloses')}</span>
              </>
            )}
          </section>

          {o.corrections.length > 0 && (
            <section className="card stack-sm">
              <h2 className="section-title" style={{ margin: 0 }}>{t('order.corrections')}</h2>
              {o.corrections.map((c) => (
                <div key={c.id} className="stack-sm" style={{ gap: 2 }}>
                  <span>{c.note}</span>
                  <span className="small muted">
                    {fmt.date(c.createdAt, true)} ·{' '}
                    {c.status === 'pending' ? t('order.correctionPending') : c.status === 'approved' ? t('order.correctionDone') : t('order.correctionDeclined')}
                    {c.decisionNote && ` · ${c.decisionNote}`}
                  </span>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
      {correction && <CorrectionPanel o={o} onClose={() => setCorrection(false)} />}
    </>
  );
}

function StatusBanner({ o }: { o: OrderDetail }) {
  const t = useTranslations('order');
  const fmt = useFmt();
  const actions = <ChaseActions orderId={o.id} number={o.number} customerName={o.customerName} phone={o.customer.phone} email={o.customer.email} />;
  const banner = (tone: string, title: string, text: React.ReactNode, extra?: React.ReactNode, titleCls = '') => (
    <div className={`banner ${tone}`}>
      <div className="grow stack-sm" style={{ gap: 2 }}>
        <div className={`title-3 ${titleCls}`}>{title}</div>
        <div className="muted num">{text}</div>
      </div>
      {extra}
    </div>
  );
  switch (o.status) {
    case 'late':
      return banner('', t('lateBanner', { n: o.daysLate }), t('owes', { amount: fmt.money(o.totalCents), date: fmt.date(o.dueDate, true) }), actions, 'bad');
    case 'waiting_for_payment':
      return banner('banner-warn', t('waitingBanner'), t('waitingText', { date: fmt.date(o.dueDate, true), hold: fmt.date(o.holdUntil, true) }), actions);
    case 'paid':
      return banner('banner-good', t('paidBanner'), t('paidText'));
    case 'sent_to_warehouse':
      return banner('banner-good', t('warehouseBanner'), t('warehouseText', { customer: o.customerName }));
    case 'delivered':
      return banner('banner-good', t('deliveredBanner'), t('deliveredText'));
    case 'invoice_issued':
      return banner('banner-good', t('closedBanner'), t('closedText'));
    case 'cancelled':
      return banner('banner-grey', t('cancelledBanner'), t('cancelledText', { date: fmt.date(o.cancelledAt ?? o.orderedAt, true) }));
  }
}

/** Design system › ProgressSteps (vertical): done = accent check, current = ring and number, late = bad ring. */
function Progress({ o }: { o: OrderDetail }) {
  const t = useTranslations('order');
  const fmt = useFmt();
  const labels = { sent: t('stepSent'), paid: t('stepPaid'), warehouse: t('stepWarehouse'), delivered: t('stepDelivered'), invoiced: t('stepInvoiced') };
  const currentIdx = o.status === 'cancelled' ? -1 : o.steps.findIndex((s) => !s.at);
  return (
    <ol className="psteps">
      {o.steps.map((s, i) => {
        const done = !!s.at;
        const current = i === currentIdx;
        const late = current && o.status === 'late';
        return (
          <li key={s.key} className={`pstep ${done ? 'done' : ''} ${current ? 'current' : ''} ${late ? 'late' : ''}`} aria-current={current ? 'step' : undefined}>
            <span className="mark num" aria-hidden>{done ? <Check size={14} weight="bold" /> : i + 1}</span>
            <span className="t">{labels[s.key]}</span>
            <span className={`s num ${late ? 'bad' : ''}`}>{done ? fmt.date(s.at!, true) : late ? t('notYetLate', { n: o.daysLate }) : t('notYet')}</span>
          </li>
        );
      })}
    </ol>
  );
}

function CorrectionPanel({ o, onClose }: { o: OrderDetail; onClose: () => void }) {
  const t = useTranslations('correction');
  const tc = useTranslations('common');
  const qc = useQueryClient();
  const toast = useToast();
  const errorText = useErrorText();
  const [note, setNote] = useState('');
  const send = useMutation({
    mutationFn: () => post(`/orders/${o.id}/corrections`, { note }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.order(o.id) });
      toast(t('sent'));
      onClose();
    },
  });
  return (
    <Panel
      title={t('title')}
      sub={t('intro', { number: o.number })}
      onClose={onClose}
      error={send.error ? errorText(send.error) : undefined}
      footer={
        <>
          <button className="btn" onClick={onClose}>{tc('cancel')}</button>
          <button className="btn btn-primary" disabled={!note.trim()} aria-busy={send.isPending} onClick={() => !send.isPending && send.mutate()}>
            {send.isPending && <Spinner />}
            {t('submit')}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="label">{t('note')}</span>
        <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </label>
    </Panel>
  );
}
