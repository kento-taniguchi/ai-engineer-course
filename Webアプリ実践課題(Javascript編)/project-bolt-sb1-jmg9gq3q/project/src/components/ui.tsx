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
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-navy-100 bg-white shadow-2xl sm:rounded-2xl ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'
        }`}
      >
        <div className="flex items-center justify-between border-b border-navy-100 px-5 py-4">
          <h2 className="text-lg font-bold text-navy">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="閉じる">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center gap-2 border-t border-navy-100 px-5 py-3">{footer}</div>}
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
            value === p.value ? p.badge : 'text-slate-400 hover:bg-slate-50'
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
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white shadow-sm shadow-accent/30 transition hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-40';

export const ghostButton =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-navy-100 bg-white px-3 py-2 text-sm font-medium text-navy transition hover:bg-navy-50';
