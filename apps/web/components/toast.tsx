'use client';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle, Bell } from '@phosphor-icons/react';

interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'update';
  onClick?: () => void;
}

const Ctx = createContext<(text: string, opts?: { kind?: Toast['kind']; onClick?: () => void }) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, opts: { kind?: Toast['kind']; onClick?: () => void } = {}) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, kind: opts.kind ?? 'ok', onClick: opts.onClick }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {toasts.map((t) => (
          <button
            key={t.id}
            className="toast"
            onClick={() => {
              t.onClick?.();
              setToasts((all) => all.filter((x) => x.id !== t.id));
            }}
          >
            {t.kind === 'ok' ? <CheckCircle size={20} className="good" /> : <Bell size={20} className="accent" />}
            <span>{t.text}</span>
          </button>
        ))}
      </div>
    </Ctx.Provider>
  );
}
