'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle, Info, MagnifyingGlass, Warning, WarningCircle } from '@phosphor-icons/react';
import { isReverseCharge, parseVat, type SearchResult } from '@ananda-agents/shared';
import { api, post, ApiError } from '../lib/api';
import { keys, useErrorText, useFmt } from '../lib/hooks';
import { Panel } from './ui';
import { useToast } from './toast';

type Mode = { kind: 'find' } | { kind: 'add'; manual: boolean };

/** Screens 2 + 3: find a business by VAT, then add, claim or ask to take over. */
export function FindPanel({ initialQuery, onClose }: { initialQuery: string; onClose: () => void }) {
  const t = useTranslations('find');
  const tSearch = useTranslations('customers');
  const [input, setInput] = useState(initialQuery);
  const [query, setQuery] = useState(parseVat(initialQuery) ? initialQuery : '');
  const [mode, setMode] = useState<Mode>({ kind: 'find' });
  const [hint, setHint] = useState(false);

  const result = useQuery({
    queryKey: ['search', query],
    queryFn: () => api<SearchResult>(`/customers/search?q=${encodeURIComponent(query)}`),
    enabled: !!query,
    staleTime: 0,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const ok = !!parseVat(input);
    setHint(!ok);
    if (ok) {
      setMode({ kind: 'find' });
      setQuery(input.trim());
      if (input.trim() === query) void result.refetch();
    }
  };

  if (mode.kind === 'add' && result.data?.vat) {
    return <NewCustomerPanel search={result.data.vat} manual={mode.manual} onBack={() => setMode({ kind: 'find' })} onClose={onClose} />;
  }

  return (
    <Panel title={t('title')} onClose={onClose}>
      <form onSubmit={submit} className="row-flex" role="search">
        <div className="search">
          <MagnifyingGlass size={18} />
          <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="BG203145882" aria-label={t('title')} autoCapitalize="characters" spellCheck={false} />
        </div>
        <button className="btn btn-primary">{tSearch('search')}</button>
      </form>
      {hint && <p className="error-text">{t('notVat')}</p>}
      {!query && !hint && <p className="muted">{t('intro')}</p>}
      {result.isFetching && <p className="muted" aria-live="polite">{t('searching')}</p>}
      {result.data?.vat && !result.isFetching && <Result data={result.data.vat} onAdd={(manual) => setMode({ kind: 'add', manual })} onRetry={() => result.refetch()} onClose={onClose} />}
    </Panel>
  );
}

function Result({ data, onAdd, onRetry, onClose }: { data: NonNullable<SearchResult['vat']>; onAdd: (manual: boolean) => void; onRetry: () => void; onClose: () => void }) {
  const t = useTranslations('find');
  const tc = useTranslations('common');
  const fmt = useFmt();
  const router = useRouter();
  const qc = useQueryClient();
  const errorText = useErrorText();
  const { vies, ananda } = data;
  const [note, setNote] = useState('');

  const claim = useMutation({
    mutationFn: () => post(`/customers/${ananda.customerId}/claim`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.customers });
      onClose();
      router.push(`/sales/new?customer=${ananda.customerId}`);
    },
  });
  const takeOver = useMutation({ mutationFn: () => post(`/customers/${ananda.customerId}/take-over`, { note }), onSuccess: onRetry });
  const remind = useMutation({ mutationFn: () => post(`/customers/${ananda.customerId}/remind-when-free`), onSuccess: onRetry });

  return (
    <div className="stack">
      <section className="card card-tight stack-sm" aria-label={t('register')}>
        <div className="spread">
          <span className="overline">{t('register')}</span>
          {vies.status === 'valid' && (
            <span className="tag tag-good">
              <CheckCircle size={12} weight="fill" /> {t('valid')}
            </span>
          )}
        </div>
        <div className="num muted small">{vies.vatNumber}</div>
        {vies.status === 'valid' && (
          <>
            <div className="title-3">{vies.name ?? '—'}</div>
            <div className="muted">{vies.address ?? '—'}</div>
          </>
        )}
        {vies.status === 'invalid' && (
          <div className="stack-sm">
            <div className="row-flex bad strong">
              <WarningCircle size={18} /> {t('invalid')}
            </div>
            <p className="small muted">{t('invalidHint')}</p>
          </div>
        )}
        {vies.status === 'unavailable' && (
          <div className="stack-sm">
            <div className="row-flex strong" style={{ color: 'var(--warn)' }}>
              <Warning size={18} /> {t('unavailable')}
            </div>
            <p className="small muted">{t('unavailableHint')}</p>
            <div className="actions">
              <button className="btn btn-sm" onClick={onRetry}>{tc('retry')}</button>
            </div>
          </div>
        )}
      </section>

      <section className="card card-tight stack-sm" aria-label={t('inAnanda')}>
        <span className="overline">{t('inAnanda')}</span>
        {ananda.state === 'not_customer' && (
          <>
            <p>{t('notCustomer')}</p>
            {vies.status === 'valid' && vies.name && vies.address ? (
              <button className="btn btn-primary" onClick={() => onAdd(false)}>
                {t('addNew')} <ArrowRight size={16} className="flip" />
              </button>
            ) : (
              <button className="btn" onClick={() => onAdd(true)}>{t('enterByHand')}</button>
            )}
          </>
        )}
        {ananda.state === 'free' && (
          <>
            <div className="title-3">{t('freeTitle')}</div>
            <p className="muted small">
              {t('agentNone')} · {ananda.lastOrderDate ? t('lastOrder', { date: fmt.date(ananda.lastOrderDate, true) }) : t('noOrders')}
            </p>
            <p>{t('claimText')}</p>
            <button className="btn btn-primary" disabled={claim.isPending} onClick={() => claim.mutate()}>
              {t('claim')} <ArrowRight size={16} className="flip" />
            </button>
            {claim.error && <p className="error-text">{errorText(claim.error)}</p>}
          </>
        )}
        {ananda.state === 'other' && (
          <>
            <div className="title-3">{t('otherTitle')}</div>
            <p className="muted small">
              {t('agent', { name: ananda.agentName ?? '—' })} ·{' '}
              {ananda.lastOrderDate ? t('lastOrder', { date: fmt.date(ananda.lastOrderDate, true) }) : t('noOrders')}
            </p>
            <p>{ananda.freeFrom ? t('freeFrom', { date: fmt.date(ananda.freeFrom, true) }) : t('beingAdded')}</p>
            <p className="small muted">
              <Info size={14} style={{ verticalAlign: '-2px' }} /> {t('private')}
            </p>
            {ananda.takeOverPending ? (
              <div className="banner banner-blue" style={{ margin: 0 }}>{t('takeOverPending')}</div>
            ) : (
              <>
                <label className="field">
                  <span className="label">{t('takeOverNote')}</span>
                  <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
                </label>
                <button className="btn btn-primary" disabled={takeOver.isPending} onClick={() => takeOver.mutate()}>{t('takeOver')}</button>
              </>
            )}
            {ananda.freeFrom &&
              (ananda.remindOn ? (
                <p className="small good">{t('remindSet', { date: fmt.date(ananda.remindOn, true) })}</p>
              ) : (
                <button className="btn" disabled={remind.isPending} onClick={() => remind.mutate()}>{t('remindFree')}</button>
              ))}
            {(takeOver.error || remind.error) && <p className="error-text">{errorText(takeOver.error ?? remind.error)}</p>}
          </>
        )}
        {ananda.state === 'own' && (
          <>
            <div className="title-3">{t('ownTitle')}</div>
            <p className="muted">{ananda.customerName}</p>
            <div className="actions">
              <button className="btn" onClick={() => { onClose(); router.push(`/customers/${ananda.customerId}`); }}>{t('openCustomer')}</button>
              <button className="btn btn-primary" onClick={() => { onClose(); router.push(`/sales/new?customer=${ananda.customerId}`); }}>{t('newSale')}</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

const COUNTRY_NAMES = (locale: string, code: string) => {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};

function NewCustomerPanel({ search, manual, onBack, onClose }: { search: NonNullable<SearchResult['vat']>; manual: boolean; onBack: () => void; onClose: () => void }) {
  const t = useTranslations('newCustomer');
  const tc = useTranslations('common');
  const tCustomers = useTranslations('customers');
  const fmt = useFmt();
  const qc = useQueryClient();
  const toast = useToast();
  const errorText = useErrorText();
  const { vies } = search;
  const [name, setName] = useState(vies.name ?? '');
  const [country, setCountry] = useState(vies.country);
  const [address, setAddress] = useState(vies.address ?? '');
  const [delivery, setDelivery] = useState<string | null>(null);
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);

  const phoneFull = phone.trim().startsWith('+') || country !== 'BG' ? phone.trim() : `+359 ${phone.trim().replace(/^0/, '')}`;
  const phoneOk = /^\+?[0-9 ()\-]{6,20}$/.test(phoneFull);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const ok = contact.trim() && phoneOk && emailOk && (!manual || (name.trim() && address.trim() && country.length === 2));

  const submit = useMutation({
    mutationFn: () =>
      post<{ id: string; number: string }>('/customers', {
        vatNumber: vies.vatNumber,
        contactName: contact.trim(),
        phone: phoneFull,
        email: email.trim(),
        deliveryAddress: delivery?.trim() || null,
        ...(manual ? { manual: { name: name.trim(), country: country.toUpperCase(), address: address.trim() } } : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.customers });
      toast(tCustomers('sentForApproval', { name: name || vies.name || '' }));
      onClose();
    },
  });

  useEffect(() => {
    if (submit.error instanceof ApiError && submit.error.code === 'manual_required' && !manual) onBack();
  }, [submit.error, manual, onBack]);

  const err = (cond: boolean) => (touched && !cond ? 'input-error' : '');
  const fromRegister = <span className="tag">{tc('fromRegister')}</span>;

  return (
    <Panel
      title={t('title')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onBack}>{tc('back')}</button>
          <button
            className="btn btn-primary"
            disabled={submit.isPending}
            onClick={() => {
              setTouched(true);
              if (ok) submit.mutate();
            }}
          >
            {t('submit')}
          </button>
        </>
      }
    >
      <div className={`banner ${manual ? 'banner-warn' : 'banner-good'}`} style={{ margin: 0 }}>
        {manual ? <Warning size={18} /> : <CheckCircle size={18} className="good" />}
        <span className="grow small">{manual ? t('manualBanner') : t('banner')}</span>
      </div>

      <label className="field">
        <span className="label">
          {t('vat')} {vies.status === 'valid' && <span className="tag tag-good">{t('validBadge')}</span>}
        </span>
        <input className="input num" readOnly value={vies.vatNumber} />
      </label>
      <label className="field">
        <span className="label">{t('company')} {!manual && fromRegister}</span>
        <input className={`input ${err(!manual || !!name.trim())}`} readOnly={!manual} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span className="label">{t('country')} {!manual && fromRegister}</span>
        <input className="input" readOnly value={COUNTRY_NAMES(fmt.locale, country)} />
      </label>
      <label className="field">
        <span className="label">{t('billing')} {!manual && fromRegister}</span>
        <textarea className={`textarea ${err(!manual || !!address.trim())}`} style={{ minHeight: 64 }} readOnly={!manual} value={address} onChange={(e) => setAddress(e.target.value)} />
      </label>
      {isReverseCharge(country) && <p className="hint">{t('reverseCharge')}</p>}

      <div className="field">
        <span className="label">{t('delivery')}</span>
        {delivery === null ? (
          <div className="spread card card-tight">
            <span className="muted">{tc('sameAsBilling')}</span>
            <button type="button" className="link-btn" onClick={() => setDelivery('')}>{t('change')}</button>
          </div>
        ) : (
          <>
            <textarea className="textarea" style={{ minHeight: 64 }} value={delivery} onChange={(e) => setDelivery(e.target.value)} aria-label={t('delivery')} />
            <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setDelivery(null)}>{t('useBilling')}</button>
          </>
        )}
      </div>

      <label className="field">
        <span className="label">{t('contact')}</span>
        <input className={`input ${err(!!contact.trim())}`} value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="off" />
        {touched && !contact.trim() && <span className="error-text">{t('required')}</span>}
      </label>
      <label className="field">
        <span className="label">{t('phone')}</span>
        <div className="prefix">
          {country === 'BG' && !phone.trim().startsWith('+') && <span>+359</span>}
          <input className={`input num ${err(phoneOk)}`} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={country === 'BG' ? '888 123 456' : '+30 210 …'} />
        </div>
        {touched && !phoneOk && <span className="error-text">{t('badPhone')}</span>}
      </label>
      <label className="field">
        <span className="label">{t('email')}</span>
        <input className={`input ${err(emailOk)}`} type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        {touched && !emailOk && <span className="error-text">{t('badEmail')}</span>}
      </label>

      <p className="hint">{t('approvalNote')}</p>
      {submit.error && <p className="error-text" role="alert">{errorText(submit.error)}</p>}
    </Panel>
  );
}
