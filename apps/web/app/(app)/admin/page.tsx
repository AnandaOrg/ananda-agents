'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCrumbs } from '../../../components/AppShell';
import { ErrorBox, Loading, OrderChip } from '../../../components/ui';
import { api, post } from '../../../lib/api';
import { useErrorText, useFmt } from '../../../lib/hooks';
import type { OrderStatus } from '@ananda-agents/shared';

interface Queue {
  customers: { id: string; number: string; name: string; vatNumber: string; country: string; address: string; contactName: string; email: string; phone: string; needsReview: boolean; agentName: string }[];
  requests: { id: string; type: 'take_over' | 'price' | 'correction'; agentName: string; customerName: string | null; orderNumber: string | null; note: string | null; targetUnitPriceCents: number | null }[];
  orders: { id: string; number: string; customerName: string; agentName: string; status: OrderStatus; totalCents: number; dueDate: string; next: OrderStatus | null }[];
}

/** Stand-in for the ANANDA Admin app: only the steps the agent app waits on. */
export default function AdminPage() {
  const t = useTranslations('admin');
  const fmt = useFmt();
  const errorText = useErrorText();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-queue'], queryFn: () => api<Queue>('/admin/queue'), refetchInterval: 15_000 });
  const [terms, setTerms] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const act = useMutation({ mutationFn: ({ path, body }: { path: string; body?: unknown }) => post(path, body ?? {}), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-queue'] }) });
  useCrumbs([{ label: t('title') }]);
  if (q.isLoading) return <Loading />;
  if (!q.data) return <ErrorBox text={errorText(q.error)} onRetry={() => q.refetch()} />;
  const { customers, requests, orders } = q.data;
  const note = (id: string) => (
    <input className="input" style={{ minHeight: 36, padding: '6px 10px' }} placeholder={t('reason')} value={notes[id] ?? ''} onChange={(e) => setNotes({ ...notes, [id]: e.target.value })} />
  );
  return (
    <div className="stack">
      <div>
        <h1 className="title-1">{t('title')}</h1>
        <p className="muted">{t('intro')}</p>
      </div>
      {act.error && <ErrorBox text={errorText(act.error)} />}

      <section className="stack-sm">
        <h2 className="title-3">{t('customers')}</h2>
        {!customers.length && <div className="card muted">{t('none')}</div>}
        {customers.map((c) => (
          <div key={c.id} className="card stack-sm">
            <div className="spread" style={{ flexWrap: 'wrap' }}>
              <div className="cell-main">
                <span className="strong">{c.name} {c.needsReview && <span className="tag" style={{ color: 'var(--warn)' }}>{t('handTyped')}</span>}</span>
                <span className="small muted num">{c.number} · {c.vatNumber} · {c.country} · {t('byAgent', { name: c.agentName })}</span>
                <span className="small muted">{c.address}</span>
                <span className="small muted">{c.contactName} · {c.phone} · {c.email}</span>
              </div>
            </div>
            <div className="row-flex" style={{ flexWrap: 'wrap' }}>
              <label className="row-flex small muted">
                {t('terms')}
                <input className="input num" style={{ width: 80, minHeight: 36 }} inputMode="numeric" value={terms[c.id] ?? '0'} onChange={(e) => setTerms({ ...terms, [c.id]: e.target.value })} />
              </label>
              <button className="btn btn-sm btn-primary" onClick={() => act.mutate({ path: `/admin/customers/${c.id}/approve`, body: { paymentTermsDays: Number(terms[c.id] ?? 0) } })}>{t('approve')}</button>
              {note(c.id)}
              <button className="btn btn-sm btn-danger" onClick={() => act.mutate({ path: `/admin/customers/${c.id}/reject`, body: { note: notes[c.id] } })}>{t('reject')}</button>
            </div>
          </div>
        ))}
      </section>

      <section className="stack-sm">
        <h2 className="title-3">{t('requests')}</h2>
        {!requests.length && <div className="card muted">{t('none')}</div>}
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
              <button className="btn btn-sm btn-primary" onClick={() => act.mutate({ path: `/admin/requests/${r.id}/approve`, body: { note: notes[r.id] } })}>{t('approve')}</button>
              <button className="btn btn-sm btn-danger" onClick={() => act.mutate({ path: `/admin/requests/${r.id}/decline`, body: { note: notes[r.id] } })}>{t('decline')}</button>
            </div>
          </div>
        ))}
      </section>

      <section className="stack-sm">
        <h2 className="title-3">{t('orders')}</h2>
        <div className="list" style={{ '--cols': 'minmax(0,1.5fr) 120px 170px minmax(0,1.5fr)' } as React.CSSProperties}>
          {orders.map((o) => (
            <div key={o.id} className="list-row" style={{ paddingBlock: 10 }}>
              <span className="cell-main">
                <span className="strong">{o.customerName}</span>
                <span className="small subtle num">{o.number} · {o.agentName}</span>
              </span>
              <span className="end num">{fmt.money(o.totalCents)}</span>
              <span>
                <OrderChip status={o.status} daysLate={0} />
              </span>
              <span className="actions" style={{ justifySelf: 'end' }}>
                {o.next && <button className="btn btn-sm btn-primary" onClick={() => act.mutate({ path: `/admin/orders/${o.id}/status/${o.next}` })}>{t(`advance_${o.next}`)}</button>}
                {o.status === 'waiting_for_payment' && <button className="btn btn-sm btn-danger" onClick={() => act.mutate({ path: `/admin/orders/${o.id}/status/cancelled` })}>{t('cancelOrder')}</button>}
              </span>
            </div>
          ))}
          {!orders.length && <div className="empty">{t('none')}</div>}
        </div>
      </section>
    </div>
  );
}
