'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Bell, Check, Info, WarningCircle, X } from '@phosphor-icons/react';

/** Design system › Toast. One at a time; a new one replaces the old.
 *  - saved: confirms what the person just did (fades after 5 s, pauses while hovered or focused)
 *  - error: a one-tap action on a page failed, with Try again (stays until closed)
 *  - info: something changed that they should know about, with Reload
 *  - incoming: only for something they are waiting on, with one next step
 *  - busy: slower work in progress; no close button, replaced when it finishes */
export type ToastKind = 'saved' | 'error' | 'info' | 'incoming' | 'busy';
interface ToastAction {
  label: string;
  onClick: () => void;
}
interface ToastState {
  id: number;
  text: string;
  kind: ToastKind;
  action?: ToastAction;
}
type Push = (text: string, opts?: { kind?: ToastKind; action?: ToastAction }) => void;

const Ctx = createContext<Push>(() => {});
export const useToast = () => useContext(Ctx);

const ICON: Record<Exclude<ToastKind, 'busy'>, { cls: string; el: ReactNode }> = {
  saved: { cls: 'good', el: <Check size={16} weight="bold" /> },
  error: { cls: 'bad', el: <WarningCircle size={16} weight="bold" /> },
  info: { cls: 'info', el: <Info size={16} weight="bold" /> },
  incoming: { cls: 'blue', el: <Bell size={16} weight="bold" /> },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const push = useCallback<Push>((text, opts = {}) => setToast({ id: Date.now() + Math.random(), text, kind: opts.kind ?? 'saved', action: opts.action }), []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {toast && <ToastCard key={toast.id} toast={toast} onClose={() => setToast((t) => (t?.id === toast.id ? null : t))} />}
      </div>
    </Ctx.Provider>
  );
}

function ToastCard({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  const t = useTranslations('common');
  const [paused, setPaused] = useState(false);
  const left = useRef(5000);
  const autoClose = toast.kind === 'saved' || toast.kind === 'info' || toast.kind === 'incoming';
  useEffect(() => {
    if (!autoClose || paused) return;
    const started = Date.now();
    const h = setTimeout(onClose, left.current);
    return () => {
      clearTimeout(h);
      left.current -= Date.now() - started;
    };
  }, [autoClose, paused, onClose]);
  return (
    <div
      className="toast"
      role={toast.kind === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {toast.kind === 'busy' ? (
        <span className="t-icon busy">
          <span className="spinner" style={{ width: 13, height: 13 }} />
        </span>
      ) : (
        <span className={`t-icon ${ICON[toast.kind].cls}`} aria-hidden>
          {ICON[toast.kind].el}
        </span>
      )}
      <span className="t-text">{toast.text}</span>
      {toast.action && (
        <button
          className="t-btn"
          onClick={() => {
            toast.action!.onClick();
            onClose();
          }}
        >
          {toast.action.label}
        </button>
      )}
      {toast.kind !== 'busy' && (
        <button className="t-close" onClick={onClose} aria-label={t('close')}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}
