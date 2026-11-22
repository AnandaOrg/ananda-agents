'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from '@phosphor-icons/react';
import type { OrderStatus } from '@ananda-agents/shared';
import { useCrumbs } from '../../../components/AppShell';
import { Loading, OrderChip, PageHeader, Panel, Pill, QueryError, Spinner } from '../../../components/ui';
import { useToast } from '../../../components/toast';
import { api, post, ApiError } from '../../../lib/api';
import { useErrorText, useFmt } from '../../../lib/hooks';

interface Queue {
  customers: { id: string; number: string; name: string; vatNumber: string; country: string; address: string; contactName: string; email: string; phone: string; needsReview: boolean; agentName: string }[];
  requests: { id: string; type: 'take_over' | 'price' | 'correction'; agentName: string; customerName: string | null; orderNumber: string | null; note: string | null; targetUnitPriceCents: number | null }[];
  orders: { id: string; number: string; customerName: string; agentName: string; status: OrderStatus; totalCents: number; dueDate: string; next: OrderStatus | null }[];
}
type OrderRow = Queue['orders'][number];

/** Overview: stand-in for the ANANDA Admin app, only the steps the Broker app waits on. */
export default function AdminPage() {
  const t = useTranslations('admin');
  const fmt = useFmt();
  const errorText = useErrorText();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-queue'], queryFn: () => api<Queue>('/admin/queue'), refetchInterval: 15_000 });
  const [terms, setTerms] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<OrderRow | null>(null);
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown; done: string }) => post(path, body ?? {}),
    onSuccess: (_, v) => {
      void qc.invalidateQueries({ queryKey: ['admin-queue'] });
      toast(v.done);
    },
    // A one-tap action on a page that fails gets an error toast (README › Errors).
    onError: (e) => toast(errorText(e), { kind: 'error' }),
  });
  useCrumbs([{ label: t('title') }]);
  if (q.isLoading) return <Loading />;
  if (!q.data) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  const { customers, requests, orders } = q.data;
  const note = (id: string) => (
    <input className="input grow" style={{ minHeight: 'var(--control-sm)', minWidth: 160 }} placeholder={t('reason')} value={notes[id] ?? ''} onChange={(e) => setNotes({ ...notes, [id]: e.target.value })} />
  );
  return (
    <>
      <PageHeader title={t('title')} date sub={t('intro')} />

      <section style={{ marginBlockEnd: 'var(--section-gap)' }}>
        <h2 className="section-title">{t('customers')} · {customers.length}</h2>
        {!customers.length && <div className="card muted">{t('none')}</div>}
        <div className="stack">
          {customers.map((c) => (
            <div key={c.id} className="card stack-sm">
              <div className="cell-main">
                <span className="row-flex" style={{ gap: 8 }}>
                  <span className="strong">{c.name}</span>
                  {c.needsReview && <Pill tone="warn">{t('handTyped')}</Pill>}
                </span>
                <span className="small muted num">{c.number} · {c.vatNumber} · {c.country} · {t('byAgent', { name: c.agentName })}</span>
                <span className="small muted">{c.address}</span>
                <span className="small muted">{c.contactName} · {c.phone} · {c.email}</span>
              </div>
              <div className="row-flex" style={{ flexWrap: 'wrap' }}>
                <label className="row-flex small muted">
                  {t('terms')}
                  <input className="input num" style={{ width: 80, minHeight: 'var(--control-sm)' }} inputMode="numeric" value={terms[c.id] ?? '0'} onChange={(e) => setTerms({ ...terms, [c.id]: e.target.value })} />
                </label>
                <button className="btn btn-sm btn-primary" onClick={() => act.mutate({ path: `/admin/customers/${c.id}/approve`, body: { paymentTermsDays: Number(terms[c.id] ?? 0) }, done: t('approved') })}>{t('approve')}</button>
                {note(c.id)}
                <button className="btn btn-sm" onClick={() => act.mutate({ path: `/admin/customers/${c.id}/reject`, body: { note: notes[c.id] }, done: t('rejected') })}>{t('reject')}</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBlockEnd: 'var(--section-gap)' }}>
        <h2 className="section-title">{t('requests')} · {requests.length}</h2>
        {!requests.length && <div className="card muted">{t('none')}</div>}
        <div className="stack">
          {requests.map((r) => (
            <div key={r.id} className="card stack-sm">
              <div className="cell-main">
                <span className="strong">{t(`type_${r.type}`)} · {r.customerName}{r.orderNumber ? ` · ${r.orderNumber}` : ''}</span>
                <span className="small muted">
                  {t('byAgent', { name: r.agentName })}
                  {r.targetUnitPriceCents != null && ` · ${t('target', { price: fmt.money(r.targetUnitPriceCents) })}`}
                </span>
                {r.note && <span className="small">“{r.note}”</span>}
              </div>
              <div className="row-flex" style={{ flexWrap: 'wrap' }}>
                {note(r.id)}
                <button className="btn btn-sm btn-primary" onClick={() => act.mutate({ path: `/admin/requests/${r.id}/approve`, body: { note: notes[r.id] }, done: t('approved') })}>{t('approve')}</button>
                <button className="btn btn-sm" onClick={() => act.mutate({ path: `/admin/requests/${r.id}/decline`, body: { note: notes[r.id] }, done: t('declined') })}>{t('decline')}</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-title">{t('orders')} · {orders.length}</h2>
        {orders.length ? (
          <div className="list" style={{ '--cols': 'minmax(0,1.5fr) 130px minmax(140px,0.8fr) minmax(0,1.4fr)' } as React.CSSProperties}>
            {orders.map((o) => (
              <div key={o.id} className="list-row">
                <span className="cell-main">
                  <span className="strong">{o.customerName}</span>
                  <span className="small muted num">{o.number} · {o.agentName}</span>
                </span>
                <span className="end num">{fmt.money(o.totalCents)}</span>
                <span className="end-phone">
                  <OrderChip status={o.status} daysLate={0} />
                </span>
                <span className="actions full-phone" style={{ justifySelf: 'end' }}>
                  {o.next === 'paid' ? (
                    <button className="btn btn-sm btn-primary" onClick={() => setConfirming(o)}>
                      <ShieldCheck size={16} /> {t('advance_paid')}
                    </button>
                  ) : (
                    o.next && (
                      <button className="btn btn-sm btn-primary" onClick={() => act.mutate({ path: `/admin/orders/${o.id}/status/${o.next}`, done: t(`done_${o.next}`) })}>
                        {t(`advance_${o.next}`)}
                      </button>
                    )
                  )}
                  {o.status === 'waiting_for_payment' && (
                    <button className="btn btn-sm" onClick={() => act.mutate({ path: `/admin/orders/${o.id}/status/cancelled`, done: t('done_cancelled') })}>{t('cancelOrder')}</button>
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="card muted">{t('none')}</div>
        )}
      </section>
      {confirming && <ConfirmPaymentPanel order={confirming} onClose={() => setConfirming(null)} />}
    </>
  );
}

/** Two steps, as the client asked: the click opens this sheet, the authenticator code completes it. */
function ConfirmPaymentPanel({ order, onClose }: { order: OrderRow; onClose: () => void }) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const fmt = useFmt();
  const qc = useQueryClient();
  const toast = useToast();
  const errorText = useErrorText();
  const [code, setCode] = useState('');
  const confirm = useMutation({
    mutationFn: () => post(`/admin/orders/${order.id}/status/paid`, { code }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-queue'] });
      toast(t('done_paid'));
      onClose();
    },
  });
  const wrongCode = confirm.error instanceof ApiError && (confirm.error.code === 'bad_code' || confirm.error.code === 'too_many_attempts');
  const ready = /^\d{6}$/.test(code);
  return (
    <Panel
      title={t('confirmTitle')}
      sub={`${order.customerName} · ${order.number}`}
      onClose={onClose}
      error={confirm.error ? (wrongCode ? errorText(confirm.error) : t('notConfirmed')) : undefined}
      footer={
        <>
          <button className="btn" onClick={onClose}>{tc('cancel')}</button>
          <button className="btn btn-primary" disabled={!ready} aria-busy={confirm.isPending} onClick={() => !confirm.isPending && confirm.mutate()}>
            {confirm.isPending ? <Spinner /> : <ShieldCheck size={18} />} {t('advance_paid')}
          </button>
        </>
      }
    >
      <dl className="kv">
        <dt>{t('amount')}</dt>
        <dd className="num">{fmt.money(order.totalCents)}</dd>
        <dt>{t('broker')}</dt>
        <dd>{order.agentName}</dd>
        <dt>{t('due')}</dt>
        <dd className="num">{fmt.date(order.dueDate, true)}</dd>
      </dl>
      <p className="muted">{t('confirmText')}</p>
      <label className="field">
        <span className="label">{t('codeLabel')}</span>
        <input
          className={`input num ${wrongCode ? 'input-error' : ''}`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => e.key === 'Enter' && ready && !confirm.isPending && confirm.mutate()}
          placeholder="123456"
          style={{ letterSpacing: '0.3em', fontSize: 18 }}
        />
      </label>
    </Panel>
  );
}

