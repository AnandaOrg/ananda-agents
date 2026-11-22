'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { onlineManager, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Bank, Bell, CaretRight, Check, CheckCircle, Coins, Confetti, CurrencyEur, Gear, Globe, HandCoins, House, List, LockSimple, Moon,
  Plus, Receipt, ShieldCheck, SignOut, Sun, Translate, Tray, UserCirclePlus, Users, Warning, WarningCircle, WifiSlash, X, type Icon,
} from '@phosphor-icons/react';
import { LOCALES, THEMES, type AppNotification, type Locale, type NotificationType, type Theme } from '@ananda-agents/shared';
import { patch, post, put, SIGNED_OUT_EVENT } from '../lib/api';
import { keys, useCollections, useCustomers, useErrorText, useFmt, useMe, useNotifications } from '../lib/hooks';
import { applyTheme, resolvedTheme } from '../lib/theme';
import { Panel, Pill, Spinner, initials } from './ui';
import { useToast } from './toast';

export interface Crumb {
  label: string;
  href?: string;
}

interface Shell {
  setCrumbs: (c: Crumb[]) => void;
  openPayment: () => void;
}
const ShellCtx = createContext<Shell>({ setCrumbs: () => {}, openPayment: () => {} });
export const useShell = () => useContext(ShellCtx);

/** Pages declare their breadcrumb; the last item is the current page. */
export function useCrumbs(crumbs: Crumb[]) {
  const { setCrumbs } = useShell();
  const key = JSON.stringify(crumbs);
  useEffect(() => setCrumbs(JSON.parse(key)), [key, setCrumbs]);
}

const LANG_NAMES: Record<Locale, string> = { en: 'English', bg: 'Български', he: 'עברית' };
const LANG_SHORT: Record<Locale, string> = { en: 'EN', bg: 'BG', he: 'עב' };

function useLanguage() {
  const router = useRouter();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (locale: Locale) => patch('/me', { locale }),
    onSuccess: (_, locale) => {
      document.cookie = `aa_locale=${locale}; path=/; max-age=31536000; samesite=lax`;
      void qc.invalidateQueries({ queryKey: keys.me });
      router.refresh();
    },
  });
}

function useTheme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (theme: Theme) => patch('/me', { theme }),
    onMutate: (theme) => applyTheme(theme),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
}

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';
  const isAgent = me.data?.role === 'agent';
  const customers = useCustomers(isAgent);
  const collections = useCollections(isAgent);
  const fmt = useFmt();
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [panel, setPanel] = useState<null | 'notifications' | 'profile' | 'payment' | { note: string; title: string }>(null);
  const [signedOut, setSignedOut] = useState(false);

  useEffect(() => {
    if (!me.data) return;
    if (isAdmin && !pathname.startsWith('/admin')) router.replace('/admin');
    if (!isAdmin && pathname.startsWith('/admin')) router.replace('/customers');
  }, [me.data, isAdmin, pathname, router]);

  // Keep the theme cookie in step with the saved preference (e.g. after signing in elsewhere).
  useEffect(() => {
    if (me.data && document.documentElement.dataset.theme !== me.data.theme) applyTheme(me.data.theme);
  }, [me.data]);

  useEffect(() => {
    const on = () => setSignedOut(true);
    window.addEventListener(SIGNED_OUT_EVENT, on);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, on);
  }, []);

  const shell = useMemo<Shell>(() => ({ setCrumbs, openPayment: () => setPanel('payment') }), []);
  const needsBank = isAgent && !me.data!.payment.isSet;
  const late = collections.data?.kpi.lateCents ?? 0;
  const nav: { href: string; label: string; icon: Icon; end?: ReactNode; alert?: boolean }[] = isAdmin
    ? [{ href: '/admin', label: t('nav.admin'), icon: ShieldCheck }]
    : [
        { href: '/customers', label: t('nav.customers'), icon: Users, end: customers.data ? <span className="badge">{customers.data.customers.length}</span> : null },
        { href: '/orders', label: t('nav.orders'), icon: Receipt },
        { href: '/collections', label: t('nav.collections'), icon: HandCoins, end: late > 0 ? <span className="bad num">{fmt.money(late, true)}</span> : null, alert: late > 0 },
        { href: '/earnings', label: t('nav.earnings'), icon: Coins },
      ];
  const current = (href: string) => (pathname === href || pathname.startsWith(href + '/') ? 'page' : undefined);
  // Focused flows hide the phone tab bar (New sale, Review, Sent).
  const focused = pathname.startsWith('/sales/');
  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;
  const title = crumbs[crumbs.length - 1]?.label ?? '';

  const avatar = (
    <span className="avatar" aria-hidden>
      {me.data ? initials(me.data.name) : ''}
      {needsBank && <span className="dot" />}
    </span>
  );

  return (
    <ShellCtx.Provider value={shell}>
      <a className="sr-only" href="#content">{t('nav.skip')}</a>
      <div className={`shell ${focused ? 'focused' : ''}`}>
        <div className="sidebar-slot">
          <Sidebar nav={nav} current={current} isAdmin={isAdmin} needsBank={needsBank} avatar={avatar} onProfile={() => setPanel('profile')} onPayment={() => setPanel('payment')} />
        </div>

        <div className="main">
          <header className="header">
            {parent ? (
              <span className="back-title phone-only">
                <Link href={parent.href ?? '/'} className="icon-btn" aria-label={t('common.back')}>
                  <ArrowLeft size={18} className="flip" />
                </Link>
                <span className="title">{title}</span>
              </span>
            ) : (
              <span className="phone-brand">
                <span className="brand-mark" aria-hidden>A</span>
                <span className="brand-word">ANANDA</span>
              </span>
            )}
            <nav className="crumbs" aria-label="Breadcrumb">
              {crumbs.map((c, i) =>
                i < crumbs.length - 1 ? (
                  <span key={i} className="row-flex" style={{ gap: 8 }}>
                    {i === 0 && <House size={16} aria-hidden />}
                    <Link href={c.href ?? '#'}>{c.label}</Link>
                    <CaretRight size={12} className="flip" aria-hidden />
                  </span>
                ) : (
                  <span key={i} className="row-flex" style={{ gap: 8, minWidth: 0 }}>
                    {i === 0 && <House size={16} aria-hidden />}
                    <span className="current" aria-current="page">{c.label}</span>
                  </span>
                ),
              )}
            </nav>
            <div className="tools">
              <span className="desk-only row-flex" style={{ gap: 8 }}>
                <LanguageButton />
                <ThemeButton />
              </span>
              <NotificationsBell open={panel === 'notifications'} onToggle={() => setPanel(panel === 'notifications' ? null : 'notifications')} />
              <button className="icon-btn icon-btn-plain phone-only" style={{ padding: 0 }} onClick={() => setPanel('profile')} aria-label={t('nav.profile')}>
                {avatar}
              </button>
            </div>
          </header>
          <OfflineBanner />
          <main id="content" className="content">
            {children}
          </main>
        </div>

        {!isAdmin && (
          <nav className="tabbar" aria-label={t('nav.sections')}>
            {nav.slice(0, 2).map((n) => (
              <Link key={n.href} href={n.href} className="tab" aria-current={current(n.href)}>
                <span className="tab-icon"><n.icon size={20} /></span>
                {n.label}
              </Link>
            ))}
            <Link href="/sales/new" className="tab tab-fab" aria-label={t('nav.newSale')}>
              <span className="fab">
                <Plus size={24} weight="bold" />
              </span>
            </Link>
            {nav.slice(2).map((n) => (
              <Link key={n.href} href={n.href} className="tab" aria-current={current(n.href)}>
                <span className="tab-icon"><n.icon size={20} /></span>
                {n.label}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {panel === 'notifications' && <NotificationsPopover onClose={() => setPanel(null)} />}
      {panel === 'profile' && me.data && (
        <ProfilePanel onClose={() => setPanel(null)} onPayment={() => setPanel('payment')} onNote={(title, note) => setPanel({ title, note })} />
      )}
      {panel === 'payment' && me.data && <PaymentDetailsPanel onClose={() => setPanel(null)} />}
      {panel && typeof panel === 'object' && (
        <Panel title={panel.title} onClose={() => setPanel(null)}>
          <p className="muted">{panel.note}</p>
          <span>
            <Pill tone="mute" dot={false}>{t('common.comingLater')}</Pill>
          </span>
        </Panel>
      )}
      {signedOut && <SignedOutDialog />}
    </ShellCtx.Provider>
  );
}

// ---------- Sidebar (≥1280) and icon rail (768–1279) ----------

function Sidebar({
  nav,
  current,
  isAdmin,
  needsBank,
  avatar,
  onProfile,
  onPayment,
}: {
  nav: { href: string; label: string; icon: Icon; end?: ReactNode; alert?: boolean }[];
  current: (href: string) => 'page' | undefined;
  isAdmin: boolean;
  needsBank: boolean;
  avatar: ReactNode;
  onProfile: () => void;
  onPayment: () => void;
}) {
  const t = useTranslations();
  const me = useMe().data;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedByHover = useRef(false);

  const close = useCallback(() => {
    setOpen(false);
    openedByHover.current = false;
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        toggleRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && close();
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open, close]);

  // On laptops (1024–1279) resting the mouse on the rail for 300 ms opens it; tablets only use the button.
  const isRailWithHover = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px) and (max-width: 1279px) and (hover: hover)').matches;
  const onEnter = () => {
    if (open || !isRailWithHover()) return;
    hoverTimer.current = setTimeout(() => {
      openedByHover.current = true;
      setOpen(true);
    }, 300);
  };
  const onLeave = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (openedByHover.current) close();
  };

  return (
    <aside className="sidebar" data-open={open} ref={ref} aria-label="ANANDA" onPointerEnter={onEnter} onPointerLeave={onLeave}>
      <div className="brand">
        <span className="brand-mark" aria-hidden>A</span>
        <span className="brand-word">ANANDA</span>
        <span className="brand-tag tag">{isAdmin ? t('common.admin') : t('nav.appTag')}</span>
        <button ref={toggleRef} className="icon-btn icon-btn-plain rail-toggle" onClick={() => (open ? close() : setOpen(true))} aria-expanded={open} aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')}>
          {open ? <X size={18} /> : <List size={20} />}
        </button>
      </div>
      {!isAdmin && (
        <Link href="/sales/new" className="btn btn-primary new-sale" onClick={close} aria-label={t('nav.newSale')}>
          <Plus size={18} weight="bold" />
          <span className="label-text">{t('nav.newSale')}</span>
        </Link>
      )}
      <nav className="nav">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className="nav-item" aria-current={current(n.href)} onClick={close} aria-label={n.label}>
            <n.icon size={20} />
            <span className="label-text">{n.label}</span>
            {n.end && <span className="end">{n.end}</span>}
            {n.alert && <span className="rail-badge" aria-hidden />}
          </Link>
        ))}
      </nav>
      <div className="sidebar-foot">
        {needsBank && (
          <button
            className="setup-hint"
            onClick={() => {
              close();
              onPayment();
            }}
            aria-label={t('nav.oneThingToSetUp')}
          >
            <Warning size={18} />
            <span className="label-text">{t('nav.oneThingToSetUp')}</span>
          </button>
        )}
        <button
          className="user-card"
          onClick={() => {
            close();
            onProfile();
          }}
          aria-label={t('nav.profile')}
        >
          {avatar}
          <span className="me-text">
            <span className="strong">{me?.name ?? ''}</span>
            <span className="small muted">{me ? (isAdmin ? t('common.admin') : t('common.broker')) : ''}</span>
          </span>
        </button>
      </div>
    </aside>
  );
}

// ---------- Header tools: language, theme ----------

function LanguageButton() {
  const t = useTranslations('profile');
  const me = useMe().data;
  const setLang = useLanguage();
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
  if (!me) return null;
  return (
    <span className="popover-wrap" ref={ref}>
      <button className="lang-btn" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label={`${t('language')}: ${LANG_NAMES[me.locale]}`}>
        <Globe size={16} /> {LANG_SHORT[me.locale]}
      </button>
      {open && (
        <span className="popover" role="menu" style={{ insetBlockStart: 'calc(100% + 6px)', insetInlineEnd: 0 }}>
          {LOCALES.map((l) => (
            <button
              key={l}
              className="opt"
              role="menuitemradio"
              aria-checked={me.locale === l}
              lang={l}
              onClick={() => {
                setOpen(false);
                if (l !== me.locale) setLang.mutate(l);
              }}
            >
              {LANG_NAMES[l]}
              {me.locale === l && <Check size={16} className="check" />}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

function ThemeButton() {
  const t = useTranslations('theme');
  const me = useMe().data;
  const setTheme = useTheme();
  const [shown, setShown] = useState<'light' | 'dark'>('dark');
  useEffect(() => setShown(resolvedTheme(me?.theme ?? 'dark')), [me?.theme]);
  if (!me) return null;
  const next = shown === 'dark' ? 'light' : 'dark';
  return (
    <button
      className="icon-btn"
      onClick={() => {
        setShown(next);
        setTheme.mutate(next);
      }}
      aria-label={next === 'light' ? t('toLight') : t('toDark')}
    >
      {shown === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

// ---------- Offline banner and signed-out dialog (README › Toasts and errors) ----------

function OfflineBanner() {
  const t = useTranslations('states');
  const toast = useToast();
  const [online, setOnline] = useState(true);
  const was = useRef(true);
  useEffect(() => {
    const update = () => {
      const now = navigator.onLine;
      onlineManager.setOnline(now);
      setOnline(now);
      if (now && !was.current) toast(t('backOnline'));
      was.current = now;
    };
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [t, toast]);
  if (online) return null;
  return (
    <div className="banner banner-neutral" role="alert">
      <WifiSlash size={20} className="muted" />
      <span className="grow">{t('offline')}</span>
      <button className="text-link" onClick={() => window.location.reload()}>{t('tryAgain')}</button>
    </div>
  );
}

function SignedOutDialog() {
  const t = useTranslations('states');
  const next = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/';
  return (
    <>
      <div className="scrim" style={{ zIndex: 60 }} aria-hidden />
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="signed-out-title">
        <span className="icon-box" aria-hidden>
          <LockSimple size={22} />
        </span>
        <h2 id="signed-out-title">{t('signedOutTitle')}</h2>
        <p>{t('signedOutText')}</p>
        <a className="btn btn-primary btn-block" href={`/login?next=${encodeURIComponent(next)}`} autoFocus>
          {t('signIn')}
        </a>
      </div>
    </>
  );
}

// ---------- Notifications (UC-13): popover on desktop, bottom sheet on phone ----------

const NOTIF_ICON: Record<NotificationType, { icon: Icon; tone?: 'good' | 'bad' | 'accent' }> = {
  customer_approved: { icon: CheckCircle, tone: 'good' },
  customer_rejected: { icon: WarningCircle, tone: 'bad' },
  take_over_approved: { icon: UserCirclePlus, tone: 'good' },
  take_over_declined: { icon: WarningCircle, tone: 'bad' },
  price_approved: { icon: CurrencyEur, tone: 'good' },
  price_declined: { icon: CurrencyEur, tone: 'bad' },
  correction_resolved: { icon: CheckCircle },
  customer_free: { icon: Users, tone: 'accent' },
  order_paid: { icon: HandCoins, tone: 'good' },
  order_delivered: { icon: Receipt, tone: 'good' },
  commission_paid: { icon: Coins, tone: 'good' },
  email_bounced: { icon: WarningCircle, tone: 'bad' },
};
// Only things the person is waiting on raise a toast (design system › Toast › Incoming).
const INCOMING: Partial<Record<NotificationType, 'newSale' | 'open'>> = { customer_approved: 'newSale', price_approved: 'open', take_over_approved: 'newSale' };

function useNotificationText() {
  const t = useTranslations('notifications');
  const fmt = useFmt();
  return (n: AppNotification) => {
    const p: Record<string, string> = { ...n.params };
    if (p.price) p.price = fmt.money(Number(p.price));
    if (p.amount) p.amount = fmt.money(Number(p.amount));
    return {
      title: t.has(`titles.${n.type}`) ? t(`titles.${n.type}`) : n.type,
      body: t.has(n.type) ? t(n.type, p) : '',
    };
  };
}

function NotificationsBell({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const t = useTranslations();
  const list = useNotifications();
  const text = useNotificationText();
  const toast = useToast();
  const router = useRouter();
  const seen = useRef<Set<string> | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (!list.data) return;
    let shown: string[] = [];
    try {
      shown = JSON.parse(sessionStorage.getItem('aa_toasted') ?? '[]');
    } catch {}
    const first = seen.current === null;
    seen.current ??= new Set(shown);
    const fresh = list.data.items.filter((n) => !n.read && !seen.current!.has(n.id));
    const incoming = fresh.filter((n) => INCOMING[n.type]);
    for (const n of first ? incoming.slice(0, 1) : incoming.slice(-1)) {
      const action = INCOMING[n.type]!;
      toast(text(n).title, {
        kind: 'incoming',
        action: {
          label: action === 'newSale' ? t('nav.newSale') : t('common.open'),
          onClick: () => {
            void post(`/notifications/${n.id}/read`).then(() => qc.invalidateQueries({ queryKey: keys.notifications }));
            router.push(n.link);
          },
        },
      });
    }
    fresh.forEach((n) => seen.current!.add(n.id));
    try {
      sessionStorage.setItem('aa_toasted', JSON.stringify([...seen.current]));
    } catch {}
    if (fresh.length) {
      // An approval or payment changes lists elsewhere.
      void qc.invalidateQueries({ queryKey: keys.customers });
      void qc.invalidateQueries({ queryKey: keys.orders });
    }
  }, [list.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const unread = list.data?.unread ?? 0;
  return (
    <button className="icon-btn" onClick={onToggle} aria-expanded={open} aria-label={unread ? t('nav.notificationsNew', { n: unread }) : t('nav.notifications')}>
      <Tray size={18} className="desk-only" />
      <Bell size={18} className="phone-only" />
      {unread > 0 && <span className="count">{unread}</span>}
    </button>
  );
}

function NotificationsPopover({ onClose }: { onClose: () => void }) {
  const t = useTranslations('notifications');
  const list = useNotifications();
  const text = useNotificationText();
  const router = useRouter();
  const fmt = useFmt();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const ref = useRef<HTMLDivElement>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: keys.notifications });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (!ref.current?.contains(target) && !target.closest('[aria-expanded="true"]')) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    ref.current?.querySelector<HTMLElement>('h2')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  const open = async (n: AppNotification) => {
    if (!n.read) await post(`/notifications/${n.id}/read`).catch(() => undefined);
    void refresh();
    onClose();
    router.push(n.link);
  };

  const items = (list.data?.items ?? []).filter((n) => filter === 'all' || !n.read);
  const unread = list.data?.unread ?? 0;
  const groups = useMemo(() => {
    const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const today = day(new Date());
    const out: { key: 'today' | 'yesterday' | 'earlier'; items: AppNotification[] }[] = [];
    for (const n of items) {
      const diff = (today - day(new Date(n.createdAt))) / 86_400_000;
      const key = diff <= 0 ? 'today' : diff <= 1 ? 'yesterday' : 'earlier';
      const g = out.find((x) => x.key === key) ?? out[out.push({ key, items: [] }) - 1];
      g.items.push(n);
    }
    return out;
  }, [items]);

  return (
    <>
      <div className="scrim phone-only" onClick={onClose} aria-hidden />
      <div className="notif-pop" role="dialog" aria-labelledby="notif-title" ref={ref}>
        <div className="grabber" aria-hidden />
        <div className="np-head">
          <h2 id="notif-title" tabIndex={-1} style={{ outline: 'none' }}>{t('title')}</h2>
          {unread > 0 && (
            <button className="link-btn small" onClick={() => post('/notifications/read-all').then(refresh)}>
              {t('markAll')}
            </button>
          )}
        </div>
        <div className="np-filter chip-row" role="group" aria-label={t('title')}>
          <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{t('all')}</button>
          <button aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>
            {t('unread')} {unread > 0 && <span className="n">{unread}</span>}
          </button>
        </div>
        <div className="np-body">
          {list.data && !list.data.items.length && (
            <div className="state">
              <span className="icon-box" aria-hidden><Bell size={24} /></span>
              <h2>{t('emptyTitle')}</h2>
              <p>{t('emptyText')}</p>
            </div>
          )}
          {list.data && list.data.items.length > 0 && !items.length && (
            <div className="state">
              <span className="icon-box" aria-hidden><Check size={24} /></span>
              <h2>{t('caughtUpTitle')}</h2>
              <p>{t('caughtUpText')}</p>
            </div>
          )}
          {groups.map((g) => (
            <div key={g.key}>
              <div className="np-group">{t(g.key)}</div>
              {g.items.map((n) => {
                const { icon: I, tone } = NOTIF_ICON[n.type] ?? { icon: Bell };
                const { title, body } = text(n);
                return (
                  <button key={n.id} className={`notif ${n.read ? 'read' : ''}`} onClick={() => open(n)}>
                    <span className={`n-icon ${tone ?? ''}`} aria-hidden>
                      <I size={18} />
                    </span>
                    <span className="n-text">
                      <span className="n-title">{title}</span>
                      {body && <span className="small muted">{body}</span>}
                    </span>
                    <span className="n-time num">
                      {g.key === 'earlier' ? fmt.date(n.createdAt) : new Date(n.createdAt).toLocaleTimeString(fmt.locale, { hour: '2-digit', minute: '2-digit' })}
                      {!n.read && <span className="unread-dot" aria-label={t('unread')} />}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="np-foot">
          <span className="num">{unread ? t('unreadCount', { n: unread }) : t('allRead')}</span>
          <button className="icon-btn icon-btn-plain" onClick={onClose} aria-label={t('close')}>
            <X size={16} />
          </button>
        </div>
      </div>
    </>
  );
}

// ---------- Profile (screen 12) ----------

function ProfilePanel({ onClose, onPayment, onNote }: { onClose: () => void; onPayment: () => void; onNote: (title: string, note: string) => void }) {
  const t = useTranslations();
  const me = useMe().data!;
  const qc = useQueryClient();
  const setLang = useLanguage();
  const setTheme = useTheme();
  const [langOpen, setLangOpen] = useState(false);
  const signOut = async () => {
    await post('/auth/logout').catch(() => undefined);
    qc.clear();
    window.location.href = '/login';
  };
  return (
    <Panel
      title={
        <span className="row-flex">
          <span className="avatar avatar-lg" aria-hidden>{initials(me.name)}</span>
          <span className="cell-main">
            <span style={{ font: 'var(--type-title-3)' }}>{me.name}</span>
            <span className="small muted">{me.role === 'admin' ? t('common.admin') : t('common.broker')}</span>
          </span>
        </span>
      }
      onClose={onClose}
    >
      <div className="menu-list">
        {me.role === 'agent' && (
          <button className="menu-item" onClick={onPayment}>
            <Bank size={20} />
            {t('profile.payment')}
            <span className="end">
              {me.payment.isSet ? <Pill tone="good">{me.payment.ibanMasked}</Pill> : <Pill tone="bad">{t('profile.notSetUp')}</Pill>}
              <CaretRight size={16} className="chev" />
            </span>
          </button>
        )}
        {me.role === 'agent' && (
          <button className="menu-item" onClick={() => onNote(t('profile.events'), t('profile.eventsNote'))}>
            <Confetti size={20} />
            {t('profile.events')}
            <span className="end">
              <Pill tone="mute" dot={false}>{t('profile.ifInvited')}</Pill>
              <CaretRight size={16} className="chev" />
            </span>
          </button>
        )}
        <button className="menu-item" onClick={() => setLangOpen(!langOpen)} aria-expanded={langOpen}>
          <Translate size={20} />
          {t('profile.language')}
          <span className="end">
            {LANG_NAMES[me.locale]}
            <CaretRight size={16} className="chev" style={{ transform: langOpen ? 'rotate(90deg)' : undefined }} />
          </span>
        </button>
        {langOpen && (
          <div role="group" aria-label={t('profile.language')} className="stack-sm" style={{ gap: 2, paddingInlineStart: 32 }}>
            {LOCALES.map((l) => (
              <button key={l} className="menu-item" role="menuitemradio" aria-checked={me.locale === l} lang={l} onClick={() => l !== me.locale && setLang.mutate(l)}>
                {LANG_NAMES[l]}
                {me.locale === l && <Check size={16} className="end accent" />}
              </button>
            ))}
          </div>
        )}
        <div className="menu-item static">
          <Moon size={20} />
          {t('theme.title')}
          <span className="end seg" role="group" aria-label={t('theme.title')}>
            {THEMES.map((th) => (
              <button key={th} aria-pressed={me.theme === th} onClick={() => setTheme.mutate(th)}>
                {t(`theme.${th}`)}
              </button>
            ))}
          </span>
        </div>
        <button className="menu-item" onClick={() => onNote(t('profile.settings'), t('profile.settingsNote'))}>
          <Gear size={20} />
          {t('profile.settings')}
          <span className="end">
            <CaretRight size={16} className="chev" />
          </span>
        </button>
        <button className="menu-item" onClick={signOut}>
          <SignOut size={20} className="flip" />
          {t('profile.signOut')}
        </button>
      </div>
    </Panel>
  );
}

// ---------- Payment details (UC-12) ----------

export function PaymentDetailsPanel({ onClose }: { onClose: () => void }) {
  const t = useTranslations('payment');
  const tc = useTranslations('common');
  const me = useMe().data!;
  const qc = useQueryClient();
  const toast = useToast();
  const errorText = useErrorText();
  const [holder, setHolder] = useState(me.payment.accountHolder ?? me.name);
  const [iban, setIban] = useState('');
  const [check, setCheck] = useState<{ valid: boolean; bank: string | null; bic: string | null } | null>(null);

  useEffect(() => {
    const v = iban.replace(/\s/g, '');
    if (v.length < 15) return setCheck(null);
    const h = setTimeout(() => {
      put<{ valid: boolean; bank: string | null; bic: string | null }>('/me/payment-details/check', { iban: v }).then(setCheck, () => setCheck(null));
    }, 250);
    return () => clearTimeout(h);
  }, [iban]);

  const save = useMutation({
    mutationFn: () => put('/me/payment-details', { accountHolder: holder, iban }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.me });
      toast(t('saved'));
      onClose();
    },
  });
  const invalid = check && !check.valid;
  return (
    <Panel
      title={t('title')}
      sub={me.payment.isSet ? t('current', { iban: me.payment.ibanMasked ?? '' }) : undefined}
      onClose={onClose}
      error={save.error ? errorText(save.error) : undefined}
      footer={
        <>
          <button className="btn" onClick={onClose}>{tc('cancel')}</button>
          <button className="btn btn-primary" disabled={!holder.trim() || !check?.valid} aria-busy={save.isPending} onClick={() => !save.isPending && save.mutate()}>
            {save.isPending && <Spinner />}
            {tc('save')}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="label">{t('holder')}</span>
        <input className="input" value={holder} onChange={(e) => setHolder(e.target.value)} autoComplete="name" />
      </label>
      <label className="field">
        <span className="label">{t('iban')}</span>
        <input
          className={`input num ${invalid ? 'input-error' : ''}`}
          value={iban}
          onChange={(e) => setIban(e.target.value.toUpperCase())}
          placeholder="BG80 BNBG 9661 1020 3456 78"
          inputMode="text"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={!!invalid}
          aria-describedby="iban-help"
        />
        {(invalid || (check?.valid && !check.bank)) && (
          <span id="iban-help" className={invalid ? 'error-text' : 'hint'}>
            {invalid ? t('invalid') : t('unknownBank')}
          </span>
        )}
      </label>
      <div className="grid-2-even">
        <label className="field">
          <span className="label">
            {t('bank')}
            {check?.bank && <span className="tag tag-accent">{t('fromIban')}</span>}
          </span>
          <input className="input" readOnly value={check?.bank ?? me.payment.bank ?? ''} />
        </label>
        <label className="field">
          <span className="label">{t('bic')}</span>
          <input className="input num" readOnly value={check?.bic ?? me.payment.bic ?? ''} />
        </label>
      </div>
      <p className="hint row-flex" style={{ gap: 6, alignItems: 'flex-start' }}>
        <ShieldCheck size={16} style={{ flex: 'none', marginBlockStart: 1 }} /> {t('private')}
      </p>
    </Panel>
  );
}

/** Missing data the Broker must fix: a problem Banner with one small action. */
export function BankBanner() {
  const t = useTranslations('bank');
  const me = useMe();
  const { openPayment } = useShell();
  if (!me.data || me.data.role !== 'agent' || me.data.payment.isSet) return null;
  return (
    <div className="banner" role="note">
      <Bank size={20} />
      <div className="grow">
        <div className="banner-title">{t('title')}</div>
        <div className="small muted">{t('text')}</div>
      </div>
      <button className="btn btn-sm" onClick={openPayment}>{t('setUp')}</button>
    </div>
  );
}

