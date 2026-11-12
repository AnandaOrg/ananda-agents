'use client';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Backspace, CaretRight, MagnifyingGlass, Minus, PaperPlaneTilt, Plus, Tag } from '@phosphor-icons/react';
import {
  FLAVOURS,
  FLAVOUR_NAMES,
  PROFORMA_VALIDITY_DAYS,
  UNITS_PER_CARTON,
  addDays,
  calculateOrder,
  type CartonsByFlavour,
  type CustomerDetail,
  type Flavour,
  type ProformaLanguage,
  type SaleSent,
} from '@ananda-agents/shared';
import { useCrumbs } from '../../../../components/AppShell';
import { ErrorBox, FlavourDot, Loading, Panel } from '../../../../components/ui';
import { useToast } from '../../../../components/toast';
import { post } from '../../../../lib/api';
import { keys, useCustomer, useCustomers, useErrorText, useFmt } from '../../../../lib/hooks';

interface Draft {
  cartons: CartonsByFlavour;
  instructions: string;
  language: ProformaLanguage;
  key: string;
}

const draftKey = (customerId: string) => `aa_draft:${customerId}`;
const newDraft = (): Draft => ({ cartons: {}, instructions: '', language: 'en', key: crypto.randomUUID() });

/** The sale draft lives on the device so it survives closing the app or losing connection (NFR Resilience). */
function useDraft(customerId: string | null) {
  const [draft, setDraft] = useState<Draft>(newDraft);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!customerId) return;
    try {
      const saved = localStorage.getItem(draftKey(customerId));
      setDraft(saved ? { ...newDraft(), ...JSON.parse(saved) } : newDraft());
    } catch {
      setDraft(newDraft());
    }
    setLoaded(true);
  }, [customerId]);
  const update = useCallback(
    (patch: Partial<Omit<Draft, 'key'>>) =>
      setDraft((d) => {
        // Any change makes a new sale, so it gets a new idempotency key; retries of the same draft reuse it.
        const next = { ...d, ...patch, key: crypto.randomUUID() };
        try {
          if (customerId) localStorage.setItem(draftKey(customerId), JSON.stringify(next));
        } catch {}
        return next;
      }),
    [customerId],
  );
  const clear = useCallback(() => {
    try {
      if (customerId) localStorage.removeItem(draftKey(customerId));
    } catch {}
  }, [customerId]);
  return { draft, update, clear, loaded };
}

export default function NewSalePage() {
  return (
    <Suspense>
      <NewSale />
    </Suspense>
  );
}

function NewSale() {
  const t = useTranslations();
  const params = useSearchParams();
  const router = useRouter();
  const customerId = params.get('customer');
  const step = params.get('step') === 'review' ? 'review' : 'edit';
  const customer = useCustomer(customerId);
  const { draft, update, clear, loaded } = useDraft(customerId);
  const [picker, setPicker] = useState(false);
  const errorText = useErrorText();

  useCrumbs(
    step === 'review'
      ? [{ label: t('nav.newSale'), href: `/sales/new?customer=${customerId}` }, { label: t('review.title') }]
      : [{ label: t('customers.title'), href: '/customers' }, { label: t('sale.title') }],
  );

  const choose = (id: string) => {
    setPicker(false);
    router.replace(`/sales/new?customer=${id}`);
  };

  if (!customerId) return <CustomerPicker onPick={choose} inline />;
  if (customer.isLoading || !loaded) return <Loading />;
  if (customer.error || !customer.data) return <ErrorBox text={errorText(customer.error)} onRetry={() => customer.refetch()} />;

  const c = customer.data;
  return (
    <>
      {step === 'edit' ? (
        <EditSale c={c} draft={draft} update={update} onChangeCustomer={() => setPicker(true)} onReview={() => router.push(`/sales/new?customer=${c.id}&step=review`)} />
      ) : (
        <ReviewSale c={c} draft={draft} update={update} clear={clear} onBack={() => router.push(`/sales/new?customer=${c.id}`)} />
      )}
      {picker && (
        <Panel title={t('sale.changeCustomer')} onClose={() => setPicker(false)}>
          <CustomerPicker onPick={choose} />
        </Panel>
      )}
    </>
  );
}

function CustomerPicker({ onPick, inline }: { onPick: (id: string) => void; inline?: boolean }) {
  const t = useTranslations('sale');
  const list = useCustomers();
  const [q, setQ] = useState('');
  const active = (list.data?.customers ?? []).filter((c) => c.chip.kind !== 'waiting_for_approval' && c.chip.kind !== 'rejected');
  const shown = active.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.vatNumber.toLowerCase().includes(q.toLowerCase()));
  const body = (
    <div className="stack">
      <div className="stack-sm">
        <h1 className={inline ? 'title-1' : 'title-3'}>{t('pickCustomer')}</h1>
        <p className="muted small">{t('pickHint')}</p>
      </div>
      <div className="search">
        <MagnifyingGlass size={18} />
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('pickCustomer')} autoFocus={inline} />
      </div>
      {list.isLoading && <Loading />}
      {list.data && !active.length && <p className="muted">{t('noCustomers')}</p>}
      <div className="list" style={{ '--cols': '1fr 20px' } as React.CSSProperties}>
        {shown.map((c) => (
          <button key={c.id} className="list-row clickable" style={{ border: 0, background: 'none', textAlign: 'start', cursor: 'pointer', width: '100%' }} onClick={() => onPick(c.id)}>
            <span className="cell-main">
              <span className="strong">{c.name}</span>
              <span className="small subtle num">{c.vatNumber}</span>
            </span>
            <CaretRight size={16} className="chev" />
          </button>
        ))}
      </div>
    </div>
  );
  return inline ? <div style={{ maxWidth: 640 }}>{body}</div> : body;
}

// ---------- Screen 4: New sale in cartons ----------

function EditSale({ c, draft, update, onChangeCustomer, onReview }: { c: CustomerDetail; draft: Draft; update: (p: Partial<Omit<Draft, 'key'>>) => void; onChangeCustomer: () => void; onReview: () => void }) {
  const t = useTranslations();
  const fmt = useFmt();
  const [keypad, setKeypad] = useState<Flavour | null>(null);
  const [panel, setPanel] = useState<null | 'price' | 'address'>(null);
  const calc = useMemo(() => calculateOrder(draft.cartons, c.country, c.approvedPrice?.unitPriceCents), [draft.cartons, c]);
  const set = (f: Flavour, n: number) => update({ cartons: { ...draft.cartons, [f]: Math.max(0, Math.min(99_999, n)) } });
  const blocked = c.status !== 'active';

  return (
    <>
      <h1 className="title-1" style={{ marginBlockEnd: 16 }}>{t('sale.title')}</h1>
      {blocked && <div className="banner banner-blue">{t('sale.notActive')}</div>}
      <div className="grid-2">
        <div className="stack">
          <section className="card stack-sm">
            <div className="spread">
              <div className="cell-main">
                <span className="title-3">{c.name}</span>
                <span className="small muted">{c.deliveryAddress ? t('sale.deliversTo', { address: c.deliveryAddress }) : t('sale.deliversBilling')}</span>
                <span className="small muted">{c.paymentTermsDays ? t('common.dueInDays', { n: c.paymentTermsDays }) : t('common.dueOnReceipt')}</span>
              </div>
              <div className="stack-sm" style={{ alignItems: 'flex-end' }}>
                <button className="link-btn" onClick={onChangeCustomer}>{t('sale.change')}</button>
                <button className="link-btn small" style={{ fontWeight: 400 }} onClick={() => setPanel('address')}>{t('newCustomer.delivery')}</button>
              </div>
            </div>
          </section>

          <section className="card">
            <h2 className="overline" style={{ marginBlockEnd: 4 }}>{t('sale.cartonsPerFlavour')}</h2>
            <div className="flavours">
              {FLAVOURS.map((f) => {
                const n = draft.cartons[f] ?? 0;
                const name = FLAVOUR_NAMES[f];
                return (
                  <div key={f} className="flavour-row">
                    <FlavourDot flavour={f} />
                    <span className="name">
                      <span className="strong">{name}</span>
                      <span className="small subtle">{t('common.units', { n: n * UNITS_PER_CARTON })}</span>
                    </span>
                    <span className="stepper">
                      <button onClick={() => set(f, n - 1)} disabled={n === 0 || blocked} aria-label={t('sale.decrease', { flavour: name })}>
                        <Minus size={18} />
                      </button>
                      <button className="value" onClick={() => setKeypad(f)} disabled={blocked} aria-label={`${t('sale.typeAmount', { flavour: name })}: ${n}`}>
                        {n}
                      </button>
                      <button onClick={() => set(f, n + 1)} disabled={blocked} aria-label={t('sale.increase', { flavour: name })}>
                        <Plus size={18} />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <label className="field">
            <span className="label">{t('sale.instructions')}</span>
            <textarea
              className="textarea"
              style={{ minHeight: 72 }}
              value={draft.instructions}
              onChange={(e) => update({ instructions: e.target.value })}
              placeholder={t('sale.instructionsHint')}
              maxLength={500}
            />
          </label>
        </div>

        <aside className="stack">
          <section className="card stack-sm" aria-live="polite">
            <span className="overline">{t('sale.priceList')}</span>
            <div className="title-2 num">{t('sale.unitPrice', { price: fmt.money(calc.unitPriceCents) })}</div>
            {calc.discounted && <span className="tag tag-accent"><Tag size={12} /> {t('sale.approvedPrice', { price: fmt.money(calc.unitPriceCents) })}</span>}
            <p className="small muted">
              {calc.nextTier
                ? t('sale.nextTier', { cartons: calc.nextTier.cartonsToGo, units: calc.nextTier.cartonsToGo * UNITS_PER_CARTON, price: fmt.money(calc.nextTier.unitPriceCents) })
                : t('sale.topTier')}
            </p>
            <hr style={{ border: 0, borderBlockStart: '1px solid var(--line)', width: '100%', margin: '6px 0' }} />
            {c.pendingPriceRequest ? (
              <p className="small" style={{ color: 'var(--warn)' }}>{t('sale.pendingPrice', { price: fmt.money(c.pendingPriceRequest.targetUnitPriceCents) })}</p>
            ) : (
              <>
                <p className="small muted">{t('sale.lowerPrice')}</p>
                <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} disabled={blocked} onClick={() => setPanel('price')}>{t('sale.askAdmin')}</button>
              </>
            )}
          </section>
          <p className="hint">{t('sale.draftKept')}</p>
        </aside>
      </div>

      <div className="sale-foot">
        <div className="figure">
          <span className="small muted">{t('common.cartons', { n: calc.totalCartons })}</span>
          <span className="v">{t('common.units', { n: calc.totalUnits })}</span>
        </div>
        <div className="figure">
          <span className="small muted">{t('sale.commission')}</span>
          <span className="v accent">{fmt.money(calc.commission.netCents)}</span>
        </div>
        <div className="figure">
          <span className="small muted">{calc.reverseCharge ? t('sale.totalNoVat') : t('sale.total')}</span>
          <span className="v">{fmt.money(calc.totalCents)}</span>
        </div>
        <button className="btn btn-primary" disabled={!calc.canContinue || blocked} onClick={onReview}>
          {t('sale.review')} <CaretRight size={16} className="flip" />
        </button>
      </div>

      {keypad && <Keypad flavour={keypad} value={draft.cartons[keypad] ?? 0} onDone={(n) => { set(keypad, n); setKeypad(null); }} onClose={() => setKeypad(null)} />}
      {panel === 'price' && <PricePanel c={c} units={calc.totalUnits} tierCents={calc.tierUnitPriceCents} onClose={() => setPanel(null)} />}
      {panel === 'address' && (
        <Panel title={t('newCustomer.delivery')} onClose={() => setPanel(null)}>
          <p>{c.deliveryAddress ?? c.billingAddress}</p>
          <p className="muted">{t('sale.changeAddressNote')}</p>
          <span className="tag">{t('common.comingLater')}</span>
        </Panel>
      )}
    </>
  );
}

function Keypad({ flavour, value, onDone, onClose }: { flavour: Flavour; value: number; onDone: (n: number) => void; onClose: () => void }) {
  const t = useTranslations('sale');
  const [v, setV] = useState(value ? String(value) : '');
  const press = (d: string) => setV((s) => (s.length >= 5 ? s : (s + d).replace(/^0+(?=\d)/, '')));
  return (
    <Panel
      title={t('keypadTitle', { flavour: FLAVOUR_NAMES[flavour] })}
      onClose={onClose}
      footer={<button className="btn btn-primary btn-block" onClick={() => onDone(Number(v || 0))}>{t('done')}</button>}
    >
      <input
        className="keypad-display input"
        style={{ border: 0, background: 'none' }}
        inputMode="numeric"
        value={v}
        onChange={(e) => setV(e.target.value.replace(/\D/g, '').slice(0, 5))}
        onKeyDown={(e) => e.key === 'Enter' && onDone(Number(v || 0))}
        aria-label={t('keypadTitle', { flavour: FLAVOUR_NAMES[flavour] })}
      />
      <div className="keypad" dir="ltr">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} onClick={() => press(d)}>{d}</button>
        ))}
        <button onClick={() => setV('')} aria-label="Clear">C</button>
        <button onClick={() => press('0')}>0</button>
        <button onClick={() => setV((s) => s.slice(0, -1))} aria-label="Backspace">
          <Backspace size={22} />
        </button>
      </div>
    </Panel>
  );
}

function PricePanel({ c, units, tierCents, onClose }: { c: CustomerDetail; units: number; tierCents: number; onClose: () => void }) {
  const t = useTranslations('price');
  const tc = useTranslations('common');
  const fmt = useFmt();
  const qc = useQueryClient();
  const toast = useToast();
  const errorText = useErrorText();
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const cents = Math.round(Number(price.replace(',', '.')) * 100);
  const valid = Number.isFinite(cents) && cents > 0 && cents < tierCents;
  const send = useMutation({
    mutationFn: () => post(`/customers/${c.id}/price-requests`, { targetUnitPriceCents: cents, note }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.customer(c.id) });
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
          <button className="btn btn-primary" disabled={!valid || send.isPending} onClick={() => send.mutate()}>{t('submit')}</button>
        </>
      }
    >
      <p className="muted">{t('current', { price: fmt.money(tierCents) })}</p>
      <label className="field">
        <span className="label">{t('target')}</span>
        <input className={`input num ${price && !valid ? 'input-error' : ''}`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="4.95" />
        {price && !valid && <span className="error-text">{t('tooHigh')}</span>}
      </label>
      {valid && units > 0 && <p className="small" style={{ color: 'var(--warn)' }}>{t('impact', { units, amount: fmt.money((tierCents - cents) * units) })}</p>}
      <label className="field">
        <span className="label">{t('note')}</span>
        <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </label>
      {send.error && <p className="error-text">{errorText(send.error)}</p>}
    </Panel>
  );
}

// ---------- Screen 5: Review and send ----------

function ReviewSale({ c, draft, update, clear, onBack }: { c: CustomerDetail; draft: Draft; update: (p: Partial<Omit<Draft, 'key'>>) => void; clear: () => void; onBack: () => void }) {
  const t = useTranslations();
  const fmt = useFmt();
  const router = useRouter();
  const qc = useQueryClient();
  const errorText = useErrorText();
  const calc = useMemo(() => calculateOrder(draft.cartons, c.country, c.approvedPrice?.unitPriceCents), [draft.cartons, c]);

  useEffect(() => {
    if (!calc.canContinue) onBack();
  }, [calc.canContinue, onBack]);

  // Saving and sending are one step (#5); the same key on retry returns the same proforma.
  const send = useMutation({
    mutationFn: () =>
      post<SaleSent>('/sales', {
        customerId: c.id,
        cartons: draft.cartons,
        language: draft.language,
        deliveryInstructions: draft.instructions || null,
        idempotencyKey: draft.key,
      }),
    onSuccess: (res) => {
      clear();
      for (const k of [keys.orders, keys.customers, keys.collections, keys.earnings, keys.customer(c.id)]) void qc.invalidateQueries({ queryKey: k });
      router.replace(`/sales/sent/${res.orderId}`);
    },
  });

  const validUntil = addDays(new Date(), PROFORMA_VALIDITY_DAYS);
  return (
    <>
      <div className="row-flex" style={{ marginBlockEnd: 16 }}>
        <button className="icon-btn" onClick={onBack} aria-label={t('common.back')}>
          <ArrowLeft size={20} className="flip" />
        </button>
        <div className="cell-main">
          <h1 className="title-1">{t('review.title')}</h1>
          <span className="muted">{c.name}</span>
        </div>
      </div>
      <div className="grid-2">
        <section className="card stack">
          <div className="stack-sm">
            {calc.lines.map((l) => (
              <div key={l.flavour} className="spread">
                <span className="row-flex">
                  <FlavourDot flavour={l.flavour} />
                  <span className="strong">{FLAVOUR_NAMES[l.flavour]}</span>
                  <span className="muted small">{t('common.cartons', { n: l.cartons })} · {t('common.units', { n: l.units })}</span>
                </span>
                <span className="num">{fmt.money(l.lineNetCents)}</span>
              </div>
            ))}
          </div>
          <dl className="kv">
            <dt>{t('review.net')}</dt>
            <dd>{fmt.money(calc.netCents)}</dd>
            <dt>{t('review.vat', { rate: calc.reverseCharge ? t('common.reverseCharge') : t('common.vat20') })}</dt>
            <dd>{fmt.money(calc.vatCents)}</dd>
            <dt className="total">{t('review.total')}</dt>
            <dd className="total">{fmt.money(calc.totalCents)}</dd>
          </dl>
          {calc.discounted && <span className="tag tag-accent">{t('review.discounted')} · {fmt.money(calc.unitPriceCents)}</span>}
          <div className="card card-tight card-accent stack-sm">
            <span className="small muted">{t('review.commission')}</span>
            <span className="num accent strong">
              {t('common.plusVat', { net: fmt.money(calc.commission.netCents), vat: fmt.money(calc.commission.vatCents), gross: fmt.money(calc.commission.grossCents) })}
            </span>
          </div>
        </section>

        <aside className="card stack">
          <span className="overline">{t('review.proforma')}</span>
          <div className="field">
            <span className="label">{t('review.language')}</span>
            <div className="seg" role="group" aria-label={t('review.language')}>
              {(['en', 'bg'] as const).map((l) => (
                <button key={l} aria-pressed={draft.language === l} onClick={() => update({ language: l })} lang={l}>
                  {l === 'en' ? 'English' : 'Български'}
                </button>
              ))}
            </div>
          </div>
          <dl className="kv">
            <dt>{t('review.validUntil')}</dt>
            <dd>{fmt.date(validUntil, true)}</dd>
            <dt>{t('review.goesTo')}</dt>
            <dd>{t('review.goesToValue')}</dd>
            <dt>{t('review.terms')}</dt>
            <dd>{c.paymentTermsDays ? t('common.dueInDays', { n: c.paymentTermsDays }) : t('common.dueOnReceipt')}</dd>
          </dl>
          <p className="small muted">{t('review.hold')}</p>
          {send.error && <ErrorBox text={errorText(send.error)} />}
          <div className="stack-sm">
            <button className="btn btn-primary btn-block" disabled={send.isPending} onClick={() => send.mutate()}>
              <PaperPlaneTilt size={18} className="flip" /> {send.isPending ? t('review.sending') : t('review.send')}
            </button>
            <span className="hint" style={{ textAlign: 'center' }}>{t('review.sendHint')}</span>
          </div>
        </aside>
      </div>
    </>
  );
}
