'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bank, Bell, CaretRight, Coins, Confetti, Gear, HandCoins, Plus, Receipt, ShieldCheck, SignOut, Translate, Users, Warning } from '@phosphor-icons/react';
import { LOCALES, type AppNotification, type Locale } from '@ananda-agents/shared';
import { patch, post, put } from '../lib/api';
import { keys, useCollections, useCustomers, useErrorText, useFmt, useMe, useNotifications } from '../lib/hooks';
import { Panel, initials } from './ui';
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

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const fmt = useFmt();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';
  const isAgent = me.data?.role === 'agent';
  const customers = useCustomers(isAgent);
  const collections = useCollections(isAgent);
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [panel, setPanel] = useState<null | 'notifications' | 'profile' | 'payment' | { note: string; title: string }>(null);

  useEffect(() => {
    if (!me.data) return;
    if (isAdmin && !pathname.startsWith('/admin')) router.replace('/admin');
    if (!isAdmin && pathname.startsWith('/admin')) router.replace('/customers');
  }, [me.data, isAdmin, pathname, router]);

  const shell: Shell = { setCrumbs, openPayment: () => setPanel('payment') };
  const needsBank = me.data?.role === 'agent' && !me.data.payment.isSet;
  const unpaid = collections.data?.kpi.lateCents ?? 0;
  const nav = isAdmin
    ? [{ href: '/admin', label: t('nav.admin'), icon: ShieldCheck }]
    : [
        { href: '/customers', label: t('nav.customers'), icon: Users, end: <span className="badge">{customers.data?.customers.length ?? '·'}</span> },
        { href: '/orders', label: t('nav.orders'), icon: Receipt },
        { href: '/collections', label: t('nav.collections'), icon: HandCoins, end: unpaid > 0 ? <span className="bad num">{fmt.money(unpaid, true)}</span> : null },
        { href: '/earnings', label: t('nav.earnings'), icon: Coins },
      ];
  const current = (href: string) => (pathname === href || pathname.startsWith(href + '/') ? 'page' : undefined);

  if (!me.data) return <div className="login" aria-busy="true">{t('common.loading')}</div>;
  const avatar = (
    <span className="avatar" aria-hidden>
      {initials(me.data.name)}
      {needsBank && <span className="dot" />}
    </span>
  );

  return (
    <ShellCtx.Provider value={shell}>
      <a className="sr-only" href="#content">{t('nav.skip')}</a>
      <div className="shell">
        <aside className="sidebar" aria-label="ANANDA">
          <div className="brand">ANANDA</div>
          {!isAdmin && (
            <Link href="/sales/new" className="btn btn-primary" style={{ marginBlockEnd: 10 }}>
              <Plus size={18} weight="bold" />
              <span className="label-text">{t('nav.newSale')}</span>
            </Link>
          )}
          <nav className="stack-sm" style={{ gap: 4 }}>
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="nav-item" aria-current={current(n.href)} title={n.label}>
                <n.icon size={20} />
                <span className="label-text">{n.label}</span>
                {'end' in n && n.end && <span className="end">{n.end}</span>}
              </Link>
            ))}
          </nav>
          <div className="sidebar-foot">
            {needsBank && (
              <button className="setup-hint" onClick={() => setPanel('payment')}>
                <Warning size={18} />
                <span className="label-text">{t('nav.oneThingToSetUp')}</span>
              </button>
            )}
            <button className="me-btn" onClick={() => setPanel('profile')} aria-label={t('nav.profile')}>
              {avatar}
              <span className="me-text cell-main">
                <span className="strong">{me.data.name}</span>
                <span className="small subtle">{isAdmin ? t('common.admin') : t('common.salesAgent')}</span>
              </span>
            </button>
          </div>
        </aside>

        <div className="main">
          <header className="header">
            <nav className="crumbs" aria-label="Breadcrumb">
              {crumbs.map((c, i) =>
                i < crumbs.length - 1 ? (
                  <span key={i} className="row-flex crumb-parent" style={{ gap: 8 }}>
                    <Link href={c.href ?? '#'}>{c.label}</Link>
                    <span className="sep" aria-hidden>/</span>
                  </span>
                ) : (
                  <span key={i} className="current" aria-current="page">{c.label}</span>
                ),
              )}
            </nav>
            <div className="tools">
              <NotificationsBell onOpen={() => setPanel('notifications')} />
              <button className="icon-btn phone-only" onClick={() => setPanel('profile')} aria-label={t('nav.profile')}>
                {avatar}
              </button>
            </div>
          </header>
          <main id="content" className="content">
            {children}
          </main>
        </div>

        {!isAdmin && (
          <nav className="tabbar" aria-label="Sections">
            {nav.slice(0, 2).map((n) => (
              <Link key={n.href} href={n.href} className="tab" aria-current={current(n.href)}>
                <n.icon size={22} />
                {n.label}
              </Link>
            ))}
            <Link href="/sales/new" className="tab tab-fab" aria-label={t('nav.newSale')}>
              <span className="fab">
                <Plus size={26} weight="bold" />
              </span>
            </Link>
            {nav.slice(2).map((n) => (
              <Link key={n.href} href={n.href} className="tab" aria-current={current(n.href)}>
                <n.icon size={22} />
                {n.label}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {panel === 'notifications' && <NotificationsPanel onClose={() => setPanel(null)} />}
      {panel === 'profile' && (
        <ProfilePanel onClose={() => setPanel(null)} onPayment={() => setPanel('payment')} onNote={(title, note) => setPanel({ title, note })} />
      )}
      {panel === 'payment' && <PaymentDetailsPanel onClose={() => setPanel(null)} />}
      {panel && typeof panel === 'object' && (
        <Panel title={panel.title} onClose={() => setPanel(null)}>
          <p className="muted">{panel.note}</p>
          <span className="tag">{t('common.comingLater')}</span>
        </Panel>
      )}
    </ShellCtx.Provider>
  );
}

// ---------- Notifications (UC-13) ----------

function useNotificationText() {
  const t = useTranslations('notifications');
  const fmt = useFmt();
  return (n: AppNotification) => {
    const p: Record<string, string> = { ...n.params };
    if (p.price) p.price = fmt.money(Number(p.price));
    if (p.amount) p.amount = fmt.money(Number(p.amount));
    return t.has(n.type) ? t(n.type, p) : n.type;
  };
}

function NotificationsBell({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations('nav');
  const list = useNotifications();
  const text = useNotificationText();
  const toast = useToast();
  const router = useRouter();
  const seen = useRef<Set<string> | null>(null);
  const qc = useQueryClient();

  // Announce new unread updates with a toast that opens the target screen.
  useEffect(() => {
    if (!list.data) return;
    let shown: string[] = [];
    try {
      shown = JSON.parse(sessionStorage.getItem('aa_toasted') ?? '[]');
    } catch {}
    const first = seen.current === null;
    seen.current ??= new Set(shown);
    const fresh = list.data.items.filter((n) => !n.read && !seen.current!.has(n.id));
    for (const n of first ? fresh.slice(0, 1) : fresh) {
      toast(text(n), {
        kind: 'update',
        onClick: () => {
          void post(`/notifications/${n.id}/read`).then(() => qc.invalidateQueries({ queryKey: keys.notifications }));
          router.push(n.link);
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
    <button className="icon-btn" onClick={onOpen} aria-label={`${t('notifications')}${unread ? ` (${unread})` : ''}`}>
      <Bell size={22} />
      {unread > 0 && <span className="count">{unread}</span>}
    </button>
  );
}

function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const t = useTranslations('notifications');
  const list = useNotifications();
  const text = useNotificationText();
  const router = useRouter();
  const fmt = useFmt();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: keys.notifications });
  const open = async (n: AppNotification) => {
    if (!n.read) await post(`/notifications/${n.id}/read`).catch(() => undefined);
    void refresh();
    onClose();
    router.push(n.link);
  };
  return (
    <Panel
      title={t('title')}
      onClose={onClose}
      footer={
        list.data?.unread ? (
          <button className="btn btn-ghost" onClick={() => post('/notifications/read-all').then(refresh)}>
            {t('markAll')}
          </button>
        ) : undefined
      }
    >
      {!list.data?.items.length && <p className="muted">{t('empty')}</p>}
      <div className="stack-sm" style={{ gap: 2 }}>
        {list.data?.items.map((n) => (
          <button key={n.id} className={`notif ${n.read ? 'read' : ''}`} onClick={() => open(n)}>
            <span className="unread-dot" aria-hidden />
            <span className="cell-main">
              <span>{text(n)}</span>
              <span className="small subtle">{fmt.date(n.createdAt)}</span>
            </span>
          </button>
        ))}
      </div>
    </Panel>
  );
}

// ---------- Profile (screen 12) ----------

function ProfilePanel({ onClose, onPayment, onNote }: { onClose: () => void; onPayment: () => void; onNote: (title: string, note: string) => void }) {
  const t = useTranslations();
  const me = useMe().data!;
  const router = useRouter();
  const qc = useQueryClient();
  const setLang = useMutation({
    mutationFn: (locale: Locale) => patch('/me', { locale }),
    onSuccess: (_, locale) => {
      document.cookie = `aa_locale=${locale}; path=/; max-age=31536000; samesite=lax`;
      void qc.invalidateQueries({ queryKey: keys.me });
      router.refresh();
    },
  });
  const signOut = async () => {
    await post('/auth/logout').catch(() => undefined);
    qc.clear();
    window.location.href = '/login';
  };
  return (
    <Panel title={t('nav.profile')} onClose={onClose}>
      <div className="row-flex">
        <span className="avatar" style={{ width: 48, height: 48, fontSize: 16 }}>{initials(me.name)}</span>
        <div className="cell-main">
          <span className="title-3">{me.name}</span>
          <span className="small muted">{me.role === 'admin' ? t('common.admin') : t('common.salesAgent')} · {me.email}</span>
        </div>
      </div>
      <div className="menu-list">
        {me.role === 'agent' && (
          <button className="menu-item" onClick={onPayment}>
            <Bank size={20} />
            {t('profile.payment')}
            <span className="end row-flex" style={{ gap: 8 }}>
              {me.payment.isSet ? <span className="tag tag-good">{me.payment.ibanMasked}</span> : <span className="chip chip-late">{t('profile.notSetUp')}</span>}
              <CaretRight size={16} className="chev" />
            </span>
          </button>
        )}
        {me.role === 'agent' && (
          <button className="menu-item" onClick={() => onNote(t('profile.events'), t('profile.eventsNote'))}>
            <Confetti size={20} />
            {t('profile.events')}
            <CaretRight size={16} className="end chev" />
          </button>
        )}
        <div className="menu-item" style={{ cursor: 'default', flexWrap: 'wrap', paddingBlock: 10 }}>
          <Translate size={20} />
          <span>{t('profile.language')}</span>
          <span className="end seg" role="group" aria-label={t('profile.language')}>
            {LOCALES.map((l) => (
              <button key={l} aria-pressed={me.locale === l} onClick={() => setLang.mutate(l)} lang={l}>
                {LANG_NAMES[l]}
              </button>
            ))}
          </span>
        </div>
        <button className="menu-item" onClick={() => onNote(t('profile.settings'), t('profile.settingsNote'))}>
          <Gear size={20} />
          {t('profile.settings')}
          <CaretRight size={16} className="end chev" />
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
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{tc('cancel')}</button>
          <button className="btn btn-primary" disabled={!holder.trim() || !check?.valid || save.isPending} onClick={() => save.mutate()}>
            {tc('save')}
          </button>
        </>
      }
    >
      {me.payment.isSet && <p className="muted">{t('current', { iban: me.payment.ibanMasked ?? '' })}</p>}
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
        <span id="iban-help" className={invalid ? 'error-text' : 'hint'}>
          {invalid ? t('invalid') : check?.valid && !check.bank ? t('unknownBank') : ''}
        </span>
      </label>
      <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <label className="field">
          <span className="label">{t('bank')}</span>
          <input className="input" readOnly value={check?.bank ?? me.payment.bank ?? ''} />
        </label>
        <label className="field">
          <span className="label">{t('bic')}</span>
          <input className="input num" readOnly value={check?.bic ?? me.payment.bic ?? ''} />
        </label>
      </div>
      {check?.bank && <span className="tag tag-accent">{t('fromIban')}</span>}
      {save.error && <p className="error-text">{errorText(save.error)}</p>}
      <p className="hint">
        <ShieldCheck size={14} style={{ verticalAlign: '-2px' }} /> {t('private')}
      </p>
    </Panel>
  );
}

export function BankBanner() {
  const t = useTranslations('bank');
  const me = useMe();
  const { openPayment } = useShell();
  if (!me.data || me.data.role !== 'agent' || me.data.payment.isSet) return null;
  return (
    <div className="banner" role="note">
      <Bank size={22} className="bad" />
      <div className="grow">
        <div className="strong">{t('title')}</div>
        <div className="small muted">{t('text')}</div>
      </div>
      <button className="btn btn-sm btn-danger" onClick={openPayment}>{t('setUp')}</button>
    </div>
  );
}
