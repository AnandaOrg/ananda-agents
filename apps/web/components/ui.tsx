'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowClockwise, ArrowLeft, Info, LockSimple, MagnifyingGlass, Tray, WarningCircle, X, type Icon } from '@phosphor-icons/react';
import type { CustomerChip, Flavour, OrderDisplayStatus } from '@ananda-agents/shared';
import { ApiError } from '../lib/api';
import { useFmt } from '../lib/hooks';

// ---------- Pills (design system › Pill): every status carries a word, never colour alone ----------

export type PillTone = 'good' | 'warn' | 'bad' | 'info' | 'blue' | 'mute';

export function Pill({ tone = 'mute', children, dot = true }: { tone?: PillTone; children: ReactNode; dot?: boolean }) {
  return <span className={`pill pill-${tone} ${dot ? '' : 'pill-nodot'}`}>{children}</span>;
}

// Late → bad, waiting for payment / coming → warn, done → good, waiting for approval (a process
// state) → info, cancelled / new → mute. Blue is kept for Broker-name and role tags.
const ORDER_TONE: Record<OrderDisplayStatus, PillTone> = {
  late: 'bad',
  waiting_for_payment: 'warn',
  paid: 'good',
  sent_to_warehouse: 'good',
  delivered: 'good',
  invoice_issued: 'good',
  cancelled: 'mute',
};

export function OrderChip({ status, daysLate }: { status: OrderDisplayStatus; daysLate: number }) {
  const t = useTranslations('status');
  return <Pill tone={ORDER_TONE[status]}>{status === 'late' ? t('late', { n: daysLate }) : t(status)}</Pill>;
}

export function CustomerStatusChip({ chip }: { chip: CustomerChip }) {
  const t = useTranslations('status');
  switch (chip.kind) {
    case 'late':
      return <Pill tone="bad">{t('late', { n: chip.days })}</Pill>;
    case 'waiting_for_approval':
      return <Pill tone="info">{t('waiting_for_approval')}</Pill>;
    case 'owes':
      return <Pill tone="warn">{t('owes')}</Pill>;
    case 'paid_up':
      return <Pill tone="good">{t('paid_up')}</Pill>;
    case 'rejected':
      return <Pill tone="mute">{t('rejected')}</Pill>;
    default:
      return <Pill tone="mute">{t('new')}</Pill>;
  }
}

export function CommissionChip({ status }: { status: 'coming' | 'paid' | 'none' }) {
  const t = useTranslations('status');
  if (status === 'none') return <Pill tone="mute">{t('cancelled')}</Pill>;
  return status === 'paid' ? <Pill tone="good">{t('commissionPaid')}</Pill> : <Pill tone="warn">{t('coming')}</Pill>;
}

// ---------- Flavours: always Aloha, Gaia, Santorini, Kyoto, each with its name ----------

export const FLAVOUR_COLOR: Record<Flavour, string> = {
  aloha: 'var(--flavour-aloha)',
  gaia: 'var(--flavour-gaia)',
  santorini: 'var(--flavour-santorini)',
  kyoto: 'var(--flavour-kyoto)',
};

export function FlavourDot({ flavour }: { flavour: Flavour }) {
  return <span className="flavour-dot" style={{ background: FLAVOUR_COLOR[flavour] }} aria-hidden />;
}

// ---------- KpiTile ----------

export function Tile({ label, value, sub, tone, onClick, href }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'bad' | 'accent'; onClick?: () => void; href?: string }) {
  const cls = `tile ${tone === 'bad' ? 'tile-bad' : tone === 'accent' ? 'tile-accent' : ''}`;
  const inner = (
    <>
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
      {sub && <span className="tile-sub">{sub}</span>}
    </>
  );
  if (href) return <Link className={cls} href={href}>{inner}</Link>;
  if (onClick) return <button type="button" className={cls} onClick={onClick}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

/** (i) in a tile's corner: the explanation shows on hover or focus, and on tap on touch screens. */
export function InfoTip({ text }: { text: string }) {
  const t = useTranslations('common');
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
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
  return (
    <span className="infotip" ref={ref} data-open={open}>
      <button type="button" className="infotip-btn" aria-label={t('moreInfo')} aria-describedby={id} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Info size={16} />
      </button>
      <span role="tooltip" id={id} className="infotip-bubble">{text}</span>
    </span>
  );
}

// ---------- PageHeader: breadcrumb lives in the shell; line above the title, title, actions ----------

export function PageHeader({ title, line, sub, actions, back, date }: { title: ReactNode; line?: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: string; date?: boolean }) {
  const t = useTranslations('common');
  const fmt = useFmt();
  // Top-level pages carry today's date above the title, on phone and desktop alike.
  const above = date ? <span className="num">{fmt.date(new Date(), true)}</span> : line;
  return (
    <div className={`page-header ${back ? 'has-back' : ''}`}>
      <div className="titles">
        {back && (
          <Link href={back} className="icon-btn back" aria-label={t('back')}>
            <ArrowLeft size={18} className="flip" />
          </Link>
        )}
        <div>
          {above && <span className="line">{above}</span>}
          <h1>{title}</h1>
          {sub && <span className="sub">{sub}</span>}
        </div>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

// ---------- States: EmptyState, LoadError, No access, Not found ----------

export function EmptyState({ icon: I = Tray, title, text, action }: { icon?: Icon; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state">
      <span className="icon-box" aria-hidden>
        <I size={24} />
      </span>
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

/** Kept for short inline messages inside cards. */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span>{children}</span>
      {action}
    </div>
  );
}

/** A query failed: no access and not found get their own pages; anything else is "Couldn't load". */
export function QueryError({ error, onRetry, what = 'page', back }: { error: unknown; onRetry?: () => void; what?: 'list' | 'page'; back?: { href: string; label: string } }) {
  const t = useTranslations('states');
  const code = error instanceof ApiError ? error.code : 'error';
  if (code === 'forbidden')
    return <FullState icon={LockSimple} title={t('noAccessTitle')} text={t('noAccessText')} back={back ?? { href: '/customers', label: t('backToCustomers') }} />;
  if (code === 'not_found' || code === 'invalid')
    return <FullState icon={MagnifyingGlass} title={t('notFoundTitle')} text={t('notFoundText')} back={back ?? { href: '/orders', label: t('backToOrders') }} />;
  return <LoadError onRetry={onRetry} what={what} server={code === 'server'} />;
}

export function LoadError({ onRetry, what = 'list', server = false }: { onRetry?: () => void; what?: 'list' | 'page'; server?: boolean }) {
  const t = useTranslations('states');
  return (
    <div className="state" role="alert">
      <span className="icon-box bad" aria-hidden>
        <WarningCircle size={24} />
      </span>
      <h2>{server ? t('serverTitle') : what === 'list' ? t('loadListTitle') : t('loadPageTitle')}</h2>
      <p>{server ? t('serverText') : t('loadText')}</p>
      {onRetry && (
        <button className="btn btn-sm" onClick={onRetry}>
          <ArrowClockwise size={16} /> {t('tryAgain')}
        </button>
      )}
    </div>
  );
}

function FullState({ icon: I, title, text, back }: { icon: Icon; title: string; text: string; back: { href: string; label: string } }) {
  return (
    <div className="state state-page">
      <span className="icon-box plain" aria-hidden>
        <I size={24} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      <Link className="btn btn-sm" href={back.href}>{back.label}</Link>
    </div>
  );
}

/** Kept for API compatibility: an inline problem banner with an optional retry. */
export function ErrorBox({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const t = useTranslations('states');
  return (
    <div className="banner" role="alert">
      <WarningCircle size={20} />
      <span className="grow">{text}</span>
      {onRetry && <button className="btn btn-sm" onClick={onRetry}>{t('tryAgain')}</button>}
    </div>
  );
}

/** Inline error above a panel's or form's buttons (README › Errors). */
export function InlineError({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p className="error-text" role="alert" id={id}>
      <WarningCircle size={16} /> <span>{children}</span>
    </p>
  );
}

// ---------- Loading: skeletons after ~300 ms, never a full-page spinner ----------

function useDelayed(ms = 300) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const h = setTimeout(() => setShow(true), ms);
    return () => clearTimeout(h);
  }, [ms]);
  return show;
}

/** Table skeleton on desktop, skeleton ListCards on phone: 6 rows shaped like the data. */
export function SkeletonRows({ cols = 'minmax(0,1.6fr) minmax(0,1fr) 120px 140px', values = 3, rows = 6, head }: { cols?: string; values?: number; rows?: number; head?: ReactNode }) {
  const t = useTranslations('common');
  const show = useDelayed();
  return (
    <div className="list" aria-busy="true" style={{ '--cols': cols } as React.CSSProperties}>
      <span className="sr-only" role="status">{t('loading')}</span>
      {head}
      {show &&
        Array.from({ length: rows }, (_, i) => (
          <div key={i} className="list-row sk-row fade-in" aria-hidden>
            <span className="cell-main" style={{ gap: 6 }}>
              <span className="sk" style={{ width: `${55 + ((i * 17) % 30)}%` }} />
              <span className="sk sk-sub" style={{ width: `${30 + ((i * 11) % 20)}%` }} />
            </span>
            {Array.from({ length: values - 1 }, (_, j) => (
              <span key={j} className={`sk hide-phone ${j === values - 2 ? 'end' : ''}`} style={{ width: 72 }} />
            ))}
            <span className="sk sk-pill end" />
          </div>
        ))}
    </div>
  );
}

export function SkeletonTiles({ n = 3 }: { n?: number }) {
  const show = useDelayed();
  return (
    <div className="tiles" style={{ '--tile-count': n } as React.CSSProperties} aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="tile" style={{ gap: 10 }}>
          {show && (
            <>
              <span className="sk sk-sub fade-in" style={{ width: '45%' }} />
              <span className="sk sk-figure fade-in" />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/** Page-level loading: keeps the space without flashing; skeleton cards for detail pages. */
export function Loading({ variant = 'cards' }: { variant?: 'cards' | 'rows' }) {
  const t = useTranslations('common');
  const show = useDelayed();
  if (variant === 'rows') return <SkeletonRows />;
  return (
    <div className="stack" aria-busy="true">
      <span className="sr-only" role="status">{t('loading')}</span>
      {show && (
        <>
          <span className="sk fade-in" style={{ height: 34, width: '40%' }} />
          <div className="card stack-sm fade-in">
            <span className="sk" style={{ width: '30%' }} />
            <span className="sk sk-sub" style={{ width: '60%' }} />
            <span className="sk sk-sub" style={{ width: '50%' }} />
          </div>
          <div className="card stack-sm fade-in">
            <span className="sk" style={{ width: '25%' }} />
            <span className="sk sk-sub" style={{ width: '70%' }} />
          </div>
        </>
      )}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden />;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

// ---------- Sheet: side panel on desktop, bottom sheet on phone ----------

/** Esc or the scrim closes it; focus moves into it and back to the trigger. Footer buttons share the width. */
export function Panel({
  title,
  sub,
  onClose,
  children,
  footer,
  error,
}: {
  title: ReactNode;
  sub?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Shown directly above the footer buttons (README › Errors). */
  error?: ReactNode;
}) {
  const t = useTranslations('common');
  const ref = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    // Focus the first field or the main action; otherwise the title (never the panel itself, which
    // would draw a focus ring round the whole sheet).
    const first = ref.current?.querySelector<HTMLElement>('.panel-body input:not([readonly]), .panel-body textarea, .panel-body select');
    (first ?? headingRef.current)?.focus({ preventScroll: true });
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, []);
  useEffect(() => {
    if (error) ref.current?.querySelector('.panel-foot')?.scrollIntoView({ block: 'nearest' });
  }, [error]);
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden />
      <div className="panel" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref}>
        <div className="grabber" aria-hidden />
        <div className="panel-head">
          <h2 id={id} ref={headingRef} tabIndex={-1}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('close')}>
            <X size={16} />
          </button>
        </div>
        {sub && <p className="panel-sub">{sub}</p>}
        <div className="panel-body">{children}</div>
        {(footer || error) && (
          <div className="panel-foot">
            {error && <InlineError>{error}</InlineError>}
            {footer && <div className="buttons">{footer}</div>}
          </div>
        )}
      </div>
    </>
  );
}
