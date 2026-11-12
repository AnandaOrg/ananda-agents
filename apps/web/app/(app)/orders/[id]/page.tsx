'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChatCircleText, FilePdf, Warning } from '@phosphor-icons/react';
import { FLAVOUR_NAMES, type OrderDetail } from '@ananda-agents/shared';
import { useCrumbs } from '../../../../components/AppShell';
import { ChaseActions } from '../../../../components/ChaseActions';
import { ErrorBox, FlavourDot, Loading, OrderChip, Panel } from '../../../../components/ui';
import { useToast } from '../../../../components/toast';
import { post } from '../../../../lib/api';
import { keys, useErrorText, useFmt, useOrder } from '../../../../lib/hooks';

/** Screen 9: one page instead of nine (#1); status and next action first, no warehouse codes or Admin warnings. */
export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations();
  const fmt = useFmt();
  const errorText = useErrorText();
  const q = useOrder(id);
  const [correction, setCorrection] = useState(false);
  useCrumbs([{ label: t('orders.title'), href: '/orders' }, { label: q.data ? `${q.data.customerName} · ${q.data.number}` : '…' }]);
  if (q.isLoading) return <Loading />;
  if (!q.data) return <ErrorBox text={errorText(q.error)} onRetry={() => q.refetch()} />;
  const o = q.data;
  const unpaid = o.status === 'late' || o.status === 'waiting_for_payment';

  return (
    <div className="stack">
      <div className="page-head" style={{ margin: 0 }}>
        <div className="stack-sm">
          <h1 className="title-1">{o.customerName}</h1>
          <span className="muted num">{t('order.meta', { number: o.number, date: fmt.date(o.orderedAt, true), agent: o.agentName })}</span>
        </div>
        <OrderChip status={o.status} daysLate={o.daysLate} />
      </div>

      <StatusBanner o={o} />
      {o.emailFailed && (
        <div className="banner banner-warn">
          <Warning size={20} />
          <span className="grow">{t('order.emailFailed')}</span>
        </div>
      )}

      <section className="card stack-sm">
        <span className="overline">{t('order.progress')}</span>
        <Progress o={o} />
      </section>

      <div className="grid-2">
        <section className="card stack">
          <span className="overline">{t('order.ordered')}</span>
          <div className="stack-sm">
            {o.lines.map((l) => (
              <div key={l.flavour} className="spread">
                <span className="row-flex">
                  <FlavourDot flavour={l.flavour} />
                  <span className="strong">{FLAVOUR_NAMES[l.flavour]}</span>
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
          {o.discounted && <span className="tag tag-accent">{t('order.discounted')} · {fmt.money(o.unitPriceCents)}</span>}
          <div className="small muted">
            <div>
              {t('order.delivery')}: {o.deliveryAddress}
            </div>
            {o.deliveryInstructions && <div>{o.deliveryInstructions}</div>}
          </div>
        </section>

        <aside className="stack">
          <section className="card card-accent stack-sm">
            <span className="overline">{t('order.yourCommission')}</span>
            {o.commissionStatus === 'none' ? (
              <p className="muted">{t('order.noCommission')}</p>
            ) : (
              <>
                <span className="title-3 num accent">
                  {t('common.plusVat', { net: fmt.money(o.commission.netCents), vat: fmt.money(o.commission.vatCents), gross: fmt.money(o.commission.grossCents) })}
                </span>
                <span className="small muted">{o.closedAt ? t('order.commissionPaidOn', { date: fmt.date(o.closedAt, true) }) : t('order.paidWhenCloses')}</span>
              </>
            )}
          </section>
          <section className="card stack-sm">
            <a className="btn" href={`/api/orders/${o.id}/proforma.pdf`} target="_blank" rel="noreferrer">
              <FilePdf size={18} /> {t('order.pdf')}
            </a>
            <span className="hint">{t('order.language', { lang: o.language === 'bg' ? 'Български' : 'English' })}</span>
            <button className="btn btn-ghost" onClick={() => setCorrection(true)}>
              <ChatCircleText size={18} /> {t('order.correction')}
            </button>
            {unpaid && (
              <span className="small subtle">
                {t('order.reminders', { n: o.reminders })}
                {o.lastReminderAt && ` · ${t('order.lastReminder', { date: fmt.date(o.lastReminderAt) })}`}
              </span>
            )}
          </section>
          {o.corrections.length > 0 && (
            <section className="card stack-sm">
              <span className="overline">{t('order.corrections')}</span>
              {o.corrections.map((c) => (
                <div key={c.id} className="stack-sm" style={{ gap: 2 }}>
                  <span>{c.note}</span>
                  <span className="small subtle">
                    {fmt.date(c.createdAt)} ·{' '}
                    {c.status === 'pending' ? t('order.correctionPending') : c.status === 'approved' ? t('order.correctionDone') : t('order.correctionDeclined')}
                    {c.decisionNote && ` · ${c.decisionNote}`}
                  </span>
                </div>
              ))}
            </section>
          )}
        </aside>
      </div>
      {correction && <CorrectionPanel o={o} onClose={() => setCorrection(false)} />}
    </div>
  );
}

function StatusBanner({ o }: { o: OrderDetail }) {
  const t = useTranslations('order');
  const fmt = useFmt();
  const actions = <ChaseActions orderId={o.id} number={o.number} customerName={o.customerName} phone={o.customer.phone} email={o.customer.email} />;
  const banner = (tone: string, title: string, text: string, extra?: React.ReactNode) => (
    <div className={`banner ${tone}`} style={{ flexWrap: 'wrap' }}>
      <div className="grow">
        <div className="title-3">{title}</div>
        <div className="small muted">{text}</div>
      </div>
      {extra}
    </div>
  );
  switch (o.status) {
    case 'late':
      return banner('', t('lateBanner', { n: o.daysLate }), t('owes', { amount: fmt.money(o.totalCents), date: fmt.date(o.dueDate) }), actions);
    case 'waiting_for_payment':
      return banner('banner-warn', t('waitingBanner'), t('waitingText', { date: fmt.date(o.dueDate, true), hold: fmt.date(o.holdUntil) }), actions);
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

function Progress({ o }: { o: OrderDetail }) {
  const t = useTranslations('order');
  const fmt = useFmt();
  const labels = { sent: t('stepSent'), paid: t('stepPaid'), warehouse: t('stepWarehouse'), delivered: t('stepDelivered'), invoiced: t('stepInvoiced') };
  const currentIdx = o.status === 'cancelled' ? -1 : o.steps.findIndex((s) => !s.at);
  return (
    <ol className="steps" style={{ padding: 0, margin: 0, listStyle: 'none' }}>
      {o.steps.map((s, i) => {
        const done = !!s.at;
        const current = i === currentIdx;
        return (
          <li key={s.key} className={`step ${done ? 'done' : ''} ${current ? 'current' : ''} ${current && o.status === 'late' ? 'late' : ''}`} aria-current={current ? 'step' : undefined}>
            <span className="bar" />
            <span className="cell-main">
              <span className="t">{labels[s.key]}</span>
              <span className={`s ${current && o.status === 'late' ? 'bad' : ''}`}>
                {done ? fmt.date(s.at!) : current && o.status === 'late' ? t('notYetLate', { n: o.daysLate }) : t('notYet')}
              </span>
            </span>
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
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{tc('cancel')}</button>
          <button className="btn btn-primary" disabled={!note.trim() || send.isPending} onClick={() => send.mutate()}>{t('submit')}</button>
        </>
      }
    >
      <p className="muted">{t('intro', { number: o.number })}</p>
      <label className="field">
        <span className="label">{t('note')}</span>
        <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </label>
      {send.error && <p className="error-text">{errorText(send.error)}</p>}
    </Panel>
  );
}
