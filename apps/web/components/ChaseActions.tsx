'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRinging, CaretDown, EnvelopeSimple, Phone } from '@phosphor-icons/react';
import type { ReminderDraft } from '@ananda-agents/shared';
import { api, post } from '../lib/api';
import { keys, useErrorText, useFmt } from '../lib/hooks';
import { Panel, Spinner } from './ui';
import { useToast } from './toast';

/** Call · E-mail · Remind for a late payer (UC-10). `buttons` on the order page; `menu` in Collections rows,
 *  where several row actions become one "Get in touch" button (design system › Tables › Row actions). */
export function ChaseActions({
  orderId,
  number,
  customerName,
  phone,
  email,
  variant = 'buttons',
}: {
  orderId: string;
  number: string;
  customerName: string;
  phone: string | null;
  email: string | null;
  variant?: 'buttons' | 'menu';
}) {
  const t = useTranslations('common');
  const [remind, setRemind] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const tel = phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : undefined;
  const mail = email ? `mailto:${email}?subject=${encodeURIComponent(`ANANDA ${number}`)}` : undefined;
  const panel = remind && <ReminderPanel orderId={orderId} customerName={customerName} onClose={() => setRemind(false)} />;

  if (variant === 'menu')
    return (
      <span className="popover-wrap" ref={ref}>
        <button className="btn btn-sm" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label={`${t('getInTouch')} · ${customerName}`}>
          {t('getInTouch')} <CaretDown size={16} />
        </button>
        {open && (
          <span className="popover" role="menu" style={{ insetBlockStart: 'calc(100% + 6px)', insetInlineEnd: 0 }}>
            {tel && <a className="opt" role="menuitem" href={tel} onClick={() => setOpen(false)}><Phone size={18} /> {t('call')}</a>}
            {mail && <a className="opt" role="menuitem" href={mail} onClick={() => setOpen(false)}><EnvelopeSimple size={18} /> {t('email')}</a>}
            <button className="opt" role="menuitem" onClick={() => { setOpen(false); setRemind(true); }}><BellRinging size={18} /> {t('remind')}</button>
          </span>
        )}
        {panel}
      </span>
    );

  return (
    <span className="actions">
      {tel && <a className="btn btn-sm" href={tel} aria-label={`${t('call')} ${customerName}`}><Phone size={16} /> {t('call')}</a>}
      {mail && <a className="btn btn-sm" href={mail} aria-label={`${t('email')} ${customerName}`}><EnvelopeSimple size={16} /> {t('email')}</a>}
      <button className="btn btn-sm" onClick={() => setRemind(true)}><BellRinging size={16} /> {t('remind')}</button>
      {panel}
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
      error={send.error ? errorText(send.error) : undefined}
      footer={
        <>
          <button className="btn" onClick={onClose}>{tc('cancel')}</button>
          <button className="btn btn-primary" disabled={!d || blocked} aria-busy={send.isPending} onClick={() => !send.isPending && send.mutate()}>
            {send.isPending && <Spinner />}
            {t('send')}
          </button>
        </>
      }
    >
      {draft.isLoading && <span className="row-flex muted"><Spinner /> {tc('loading')}</span>}
      {draft.error && <p className="error-text">{errorText(draft.error)}</p>}
      {d && (
        <>
          {!d.to && <div className="banner banner-warn" style={{ margin: 0 }}>{t('noEmail')}</div>}
          {d.nextAllowedAt && <div className="banner banner-warn" style={{ margin: 0 }}>{t('cooldown', { when: `${fmt.date(d.nextAllowedAt)} ${new Date(d.nextAllowedAt).toLocaleTimeString(fmt.locale, { hour: '2-digit', minute: '2-digit' })}` })}</div>}
          <dl className="kv kv-details">
            <dt>{t('to')}</dt>
            <dd>{d.to ?? '—'}</dd>
            <dt>{t('cc')}</dt>
            <dd className="small">{d.cc.join(', ')}</dd>
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
        </>
      )}
    </Panel>
  );
}
