'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRinging, EnvelopeSimple, Phone } from '@phosphor-icons/react';
import type { ReminderDraft } from '@ananda-agents/shared';
import { api, post } from '../lib/api';
import { keys, useErrorText, useFmt } from '../lib/hooks';
import { Panel } from './ui';
import { useToast } from './toast';

/** Call · E-mail · Remind next to every late payer (UC-10, #20). */
export function ChaseActions({ orderId, number, customerName, phone, email, size = 'sm' }: { orderId: string; number: string; customerName: string; phone: string | null; email: string | null; size?: 'sm' | 'md' }) {
  const t = useTranslations('common');
  const [remind, setRemind] = useState(false);
  const cls = `btn ${size === 'sm' ? 'btn-sm' : ''}`;
  return (
    <span className="actions">
      {phone && (
        <a className={cls} href={`tel:${phone.replace(/[^\d+]/g, '')}`} aria-label={`${t('call')} ${customerName}`}>
          <Phone size={16} /> {t('call')}
        </a>
      )}
      {email && (
        <a className={cls} href={`mailto:${email}?subject=${encodeURIComponent(`ANANDA ${number}`)}`} aria-label={`${t('email')} ${customerName}`}>
          <EnvelopeSimple size={16} /> {t('email')}
        </a>
      )}
      <button className={`${cls} btn-danger`} onClick={() => setRemind(true)}>
        <BellRinging size={16} /> {t('remind')}
      </button>
      {remind && <ReminderPanel orderId={orderId} customerName={customerName} onClose={() => setRemind(false)} />}
    </span>
  );
}

/** The reminder is drafted for the agent to read and edit; the Admins are copied on every one. */
function ReminderPanel({ orderId, customerName, onClose }: { orderId: string; customerName: string; onClose: () => void }) {
  const t = useTranslations('reminder');
  const tc = useTranslations('common');
  const fmt = useFmt();
  const qc = useQueryClient();
  const toast = useToast();
  const errorText = useErrorText();
  const draft = useQuery({ queryKey: ['reminder-draft', orderId], queryFn: () => api<ReminderDraft>(`/orders/${orderId}/reminder-draft`), staleTime: 0 });
  const [subject, setSubject] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const d = draft.data;
  const send = useMutation({
    mutationFn: () => post(`/orders/${orderId}/reminders`, { subject: subject ?? d!.subject, body: body ?? d!.body }),
    onSuccess: () => {
      for (const k of [keys.collections, keys.orders, keys.order(orderId)]) void qc.invalidateQueries({ queryKey: k });
      toast(t('sent', { email: d?.to ?? '' }));
      onClose();
    },
  });
  const blocked = !!d?.nextAllowedAt || !d?.to;
  return (
    <Panel
      title={t('title', { customer: customerName })}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{tc('cancel')}</button>
          <button className="btn btn-primary" disabled={!d || blocked || send.isPending} onClick={() => send.mutate()}>{t('send')}</button>
        </>
      }
    >
      {draft.isLoading && <p className="muted">{tc('loading')}</p>}
      {draft.error && <p className="error-text">{errorText(draft.error)}</p>}
      {d && (
        <>
          {!d.to && <div className="banner banner-warn" style={{ margin: 0 }}>{t('noEmail')}</div>}
          {d.nextAllowedAt && <div className="banner banner-warn" style={{ margin: 0 }}>{t('cooldown', { when: `${fmt.date(d.nextAllowedAt)} ${new Date(d.nextAllowedAt).toLocaleTimeString(fmt.locale, { hour: '2-digit', minute: '2-digit' })}` })}</div>}
          <dl className="kv" style={{ gridTemplateColumns: 'auto 1fr' }}>
            <dt>{t('to')}</dt>
            <dd style={{ textAlign: 'start' }}>{d.to ?? '—'}</dd>
            <dt>{t('cc')}</dt>
            <dd style={{ textAlign: 'start' }} className="small">{d.cc.join(', ')}</dd>
          </dl>
          <label className="field">
            <span className="label">{t('subject')}</span>
            <input className="input" value={subject ?? d.subject} onChange={(e) => setSubject(e.target.value)} dir="auto" />
          </label>
          <label className="field">
            <span className="label">{t('body')}</span>
            <textarea className="textarea" style={{ minHeight: 220 }} value={body ?? d.body} onChange={(e) => setBody(e.target.value)} dir="auto" />
          </label>
          <p className="hint">{t('attached')}</p>
          {send.error && <p className="error-text">{errorText(send.error)}</p>}
        </>
      )}
    </Panel>
  );
}
