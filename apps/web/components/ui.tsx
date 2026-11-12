'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { X } from '@phosphor-icons/react';
import type { CustomerChip, Flavour, OrderDisplayStatus } from '@ananda-agents/shared';

// Status chip colours (PRD Appendix B): red late, blue waiting for approval, amber waiting for
// payment / coming, green paid / delivered, grey cancelled.
const ORDER_TONE: Record<OrderDisplayStatus, string> = {
  late: 'chip-late',
  waiting_for_payment: 'chip-amber',
  paid: 'chip-green',
  sent_to_warehouse: 'chip-green',
  delivered: 'chip-green',
  invoice_issued: 'chip-green',
  cancelled: 'chip-grey',
};

export function OrderChip({ status, daysLate }: { status: OrderDisplayStatus; daysLate: number }) {
  const t = useTranslations('status');
  return <span className={`chip ${ORDER_TONE[status]}`}>{status === 'late' ? t('late', { n: daysLate }) : t(status)}</span>;
}

export function CustomerStatusChip({ chip }: { chip: CustomerChip }) {
  const t = useTranslations('status');
  switch (chip.kind) {
    case 'late':
      return <span className="chip chip-late">{t('late', { n: chip.days })}</span>;
    case 'waiting_for_approval':
      return <span className="chip chip-blue">{t('waiting_for_approval')}</span>;
    case 'owes':
      return <span className="chip chip-amber">{t('owes')}</span>;
    case 'paid_up':
      return <span className="chip chip-green">{t('paid_up')}</span>;
    case 'rejected':
      return <span className="chip chip-grey">{t('rejected')}</span>;
    default:
      return <span className="chip chip-grey">{t('new')}</span>;
  }
}

export function CommissionChip({ status }: { status: 'coming' | 'paid' | 'none' }) {
  const t = useTranslations('status');
  if (status === 'none') return <span className="chip chip-grey">{t('cancelled')}</span>;
  return <span className={`chip ${status === 'paid' ? 'chip-green' : 'chip-amber'}`}>{status === 'paid' ? t('commissionPaid') : t('coming')}</span>;
}

export const FLAVOUR_COLOR: Record<Flavour, string> = {
  aloha: 'var(--flavour-aloha)',
  gaia: 'var(--flavour-gaia)',
  santorini: 'var(--flavour-santorini)',
  kyoto: 'var(--flavour-kyoto)',
};

export function FlavourDot({ flavour }: { flavour: Flavour }) {
  return <span className="flavour-dot" style={{ background: FLAVOUR_COLOR[flavour] }} aria-hidden />;
}

export function Tile({ label, value, sub, tone, onClick, href }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'bad' | 'accent'; onClick?: () => void; href?: string }) {
  const cls = `tile ${tone === 'bad' ? 'tile-bad' : tone === 'accent' ? 'tile-accent' : ''}`;
  const inner = (
    <>
      <span className="small muted">{label}</span>
      <span className="tile-value">{value}</span>
      {sub && <span className="small subtle">{sub}</span>}
    </>
  );
  if (href) return <a className={cls} href={href}>{inner}</a>;
  if (onClick) return <button type="button" className={cls} onClick={onClick}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span>{children}</span>
      {action}
    </div>
  );
}

export function Loading() {
  const t = useTranslations('common');
  return <div className="empty" aria-busy="true">{t('loading')}</div>;
}

export function ErrorBox({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const t = useTranslations('common');
  return (
    <div className="banner" role="alert">
      <span className="grow">{text}</span>
      {onRetry && <button className="btn btn-sm" onClick={onRetry}>{t('retry')}</button>}
    </div>
  );
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

/** Right-hand panel on desktop, bottom sheet on phone. Esc or a click outside closes it. */
export function Panel({ title, onClose, children, footer, labelledBy }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; labelledBy?: string }) {
  const t = useTranslations('common');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector<HTMLElement>('input, textarea, select, button.btn-primary');
    (first ?? ref.current)?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [onClose]);
  const id = labelledBy ?? 'panel-title';
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden />
      <div className="panel" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref} tabIndex={-1}>
        <div className="grabber" aria-hidden />
        <div className="panel-head">
          <h2 id={id}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('close')}>
            <X size={20} />
          </button>
        </div>
        <div className="panel-body">{children}</div>
        {footer && <div className="panel-foot">{footer}</div>}
      </div>
    </>
  );
}
