import { useState } from 'react';
import { CalendarClock, CornerDownRight, Star, UserRound } from 'lucide-react';
import type { TaskTemplate } from '@/lib/supabase';
import { formatDateTime, toInputValue } from '@/lib/date';
import { buildFromTemplate, isSet, priorityMeta, timingLabel } from '@/lib/tasks';
import { CUSTOMER_HISTORY_KEY, hasCustomerToken } from '@/lib/customer';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { Field, Modal, ghostButton, inputClass, primaryButton } from '@/components/ui';

interface Props {
  template: TaskTemplate;
  now: Date;
  /** カレンダーを押して開いたときの日時 */
  initialAt?: Date | null;
  /** すでに登録したタスクから拾った、お客さんの名前 */
  pastNames?: string[];
  /** base が null ならカレンダーに入れない（1件だけのテンプレートのとき） */
  onApply: (base: Date | null, customer: string) => void;
  onClose: () => void;
}

/** 初期値：次のちょうどの時刻（今が 14:20 なら 15:00） */
function nextHour() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}

/** テンプレート・セットを登録する前に、実施日時とお客さんの名前を決める画面 */
export function ApplyTemplateDialog({ template, now, initialAt, pastNames = [], onApply, onClose }: Props) {
  const single = !isSet(template);
  const needsCustomer = hasCustomerToken(template);
  const [value, setValue] = useState(() => toInputValue((initialAt ?? nextHour()).toISOString()));
  const [noDate, setNoDate] = useState(single && !initialAt);
  const [customer, setCustomer] = useState('');
  const [history, setHistory] = useLocalStorage<string[]>(CUSTOMER_HISTORY_KEY, []);
  const suggestions = [...new Set([...history, ...pastNames])];

  const parsed = value ? new Date(value) : null;
  const base = noDate ? null : parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
  const valid = (noDate || !!base) && (!needsCustomer || !!customer.trim());
  const { core, subs } = buildFromTemplate(template, base, customer);
  const rows = [core, ...subs];

  const apply = () => {
    if (!valid) return;
    const name = customer.trim();
    if (name) setHistory((h) => [name, ...h.filter((x) => x !== name)].slice(0, 30));
    onApply(base, name);
  };

  return (
    <Modal
      title={`「${template.name}」を登録`}
      onClose={onClose}
      footer={
        <>
          <div className="flex-1" />
          <button onClick={onClose} className={ghostButton}>
            キャンセル
          </button>
          <button onClick={apply} disabled={!valid} className={primaryButton}>
            {rows.length}件を登録
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        {needsCustomer && (
          <div>
            <Field label="お客さんの名前">
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" aria-hidden />
                <input
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  list="customer-history"
                  maxLength={40}
                  className={`${inputClass} pl-9`}
                  autoFocus
                />
                <datalist id="customer-history">
                  {suggestions.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
            </Field>
            {suggestions.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {suggestions.slice(0, 12).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCustomer(n)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
                      customer.trim() === n
                        ? 'border-navy bg-navy text-white'
                        : 'border-navy-100 bg-white text-navy hover:border-navy-200 hover:bg-navy-50'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <Field label={`実施日時（${core.title || template.items[0].title}）`}>
            <input
              type="datetime-local"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={noDate}
              className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400`}
              autoFocus={!needsCustomer}
            />
          </Field>
          {single && (
            <label className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={noDate} onChange={(e) => setNoDate(e.target.checked)} className="h-3.5 w-3.5 accent-navy" />
              カレンダーに入れない
            </label>
          )}
        </div>

        <ul className="space-y-1.5">
          {rows.map((r, idx) => {
            const item = template.items[idx];
            const at = r.scheduled_at ?? null;
            const past = !!at && new Date(at).getTime() < now.getTime();
            return (
              <li
                key={idx}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  idx === 0 ? 'border-navy-200 bg-navy-50' : 'ml-5 border-navy-100'
                }`}
              >
                {idx === 0 ? <Star className="h-3.5 w-3.5 shrink-0 text-navy" /> : <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-navy-400" />}
                <span className={`h-2 w-2 shrink-0 rounded-full ${priorityMeta(item.priority).stripe}`} />
                <span className={`min-w-0 flex-1 truncate ${idx === 0 ? 'font-bold text-navy' : 'text-slate-700'}`}>
                  {r.title}
                  {idx > 0 && <span className="ml-1 text-[11px] font-normal text-slate-500">{timingLabel(item.timing)}</span>}
                </span>
                {at ? (
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] tabular-nums ${
                      past ? 'bg-red-600 font-bold text-white' : 'bg-navy text-white'
                    }`}
                  >
                    <CalendarClock className="h-3 w-3" />
                    {formatDateTime(at)}
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] text-slate-500">カレンダーなし</span>
                )}
              </li>
            );
          })}
        </ul>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
