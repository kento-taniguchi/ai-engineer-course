import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { Priority } from '@/lib/supabase';
import { PRIORITIES } from '@/lib/tasks';

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex animate-overlay-in items-end justify-center bg-navy-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`flex max-h-[92dvh] w-full animate-dialog-in flex-col rounded-t-2xl border border-navy-100 bg-white shadow-2xl sm:rounded-2xl ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'
        }`}
      >
        <div className="flex items-center justify-between border-b border-navy-100 px-5 py-4">
          <h2 id="modal-title" className="text-lg font-bold text-navy">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-navy" aria-label="閉じる">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center gap-2 border-t border-navy-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function PriorityPicker({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-navy-100 bg-white p-0.5" role="radiogroup" aria-label="優先度">
      {PRIORITIES.map((p) => (
        <button
          key={p.value}
          type="button"
          role="radio"
          aria-checked={value === p.value}
          onClick={() => onChange(p.value)}
          className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${
            value === p.value ? p.badge : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-navy">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-navy-100 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15';

export const primaryButton =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-navy-900 transition hover:bg-accent-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40';

export const ghostButton =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-navy-100 bg-white px-3 py-2 text-sm font-medium text-navy transition hover:border-navy-200 hover:bg-navy-50 active:scale-[0.98]';

/** 単価の入力欄（円）。空欄は単価なし */
export function PriceInput({
  value,
  onChange,
  compact = false,
  label = '単価',
}: {
  value: string;
  onChange: (v: string) => void;
  compact?: boolean;
  label?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-navy-400" aria-hidden>
        ¥
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        aria-label={label}
        maxLength={10}
        className={`${inputClass} pl-6 tabular-nums ${compact ? 'py-1.5 text-xs' : ''}`}
      />
    </div>
  );
}

/** Google の「G」のロゴ（4色） */
export function GoogleLogo({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.5z" />
    </svg>
  );
}
