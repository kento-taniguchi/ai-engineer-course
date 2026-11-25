import { useState } from 'react';
import { ArrowLeft, Clock, Pause, Pencil, Play, Plus, Repeat, Trash2 } from 'lucide-react';
import type { Priority, RecurrenceRule, RecurringDraft, RecurringTask } from '@/lib/supabase';
import { DURATION_OPTIONS, WEEKDAYS, dayKey, formatDuration } from '@/lib/date';
import { WEEKDAY_ORDER, nextOccurrences, recurringLabel } from '@/lib/recurrence';
import { priorityMeta } from '@/lib/tasks';
import { Field, Modal, PriceInput, PriorityPicker, ghostButton, inputClass, primaryButton } from '@/components/ui';
import { parsePrice, priceText, yen } from '@/lib/sales';
import { CategorySelect } from '@/components/CategorySelect';
import type { CategoryColor } from '@/lib/colors';

type Mode = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'interval';

interface Draft extends RecurringDraft {
  id?: string;
  mode: Mode;
  category: string;
  /** 単価の入力欄の文字 */
  priceInput: string;
}

const MODES: { value: Mode; label: string }[] = [
  { value: 'daily', label: '毎日' },
  { value: 'weekdays', label: '平日（月〜金）' },
  { value: 'weekly', label: '毎週・隔週（曜日を選ぶ）' },
  { value: 'monthly', label: '毎月（日にちを選ぶ）' },
  { value: 'interval', label: '○日ごと' },
];

function modeOf(rule: RecurrenceRule): Mode {
  if (rule.kind === 'monthly') return 'monthly';
  if (rule.kind === 'daily') return rule.interval > 1 ? 'interval' : 'daily';
  const workdays = rule.interval === 1 && rule.weekdays.length === 5 && [1, 2, 3, 4, 5].every((w) => rule.weekdays.includes(w));
  return workdays ? 'weekdays' : 'weekly';
}

function ruleFor(mode: Mode, prev: RecurrenceRule, today: Date): RecurrenceRule {
  switch (mode) {
    case 'daily':
      return { kind: 'daily', interval: 1 };
    case 'interval':
      return { kind: 'daily', interval: prev.kind === 'daily' && prev.interval > 1 ? prev.interval : 2 };
    case 'weekdays':
      return { kind: 'weekly', weekdays: [1, 2, 3, 4, 5], interval: 1 };
    case 'weekly':
      return prev.kind === 'weekly' && modeOf(prev) === 'weekly' ? prev : { kind: 'weekly', weekdays: [today.getDay()], interval: 1 };
    case 'monthly':
      return prev.kind === 'monthly' ? prev : { kind: 'monthly', day: Math.min(today.getDate(), 28) };
  }
}

const blank = (today: Date): Draft => ({
  title: '',
  notes: '',
  priority: 2,
  duration_minutes: 30,
  time: '09:00',
  rule: { kind: 'daily', interval: 1 },
  start_date: dayKey(today),
  category: '',
  priceInput: '',
  mode: 'daily',
});

interface Props {
  tasks: RecurringTask[];
  now: Date;
  categories: string[];
  colorOf: (category: string) => CategoryColor;
  onCreate: (d: RecurringDraft) => Promise<boolean>;
  onUpdate: (id: string, d: RecurringDraft) => Promise<boolean>;
  onSetActive: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function RecurringManager({ tasks, now, categories, colorOf, onCreate, onUpdate, onSetActive, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  if (draft) {
    const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
    const rule = draft.rule;
    const canSave = !!draft.title.trim() && (rule.kind !== 'weekly' || rule.weekdays.length > 0);
    const preview = canSave ? nextOccurrences(draft, now, 4) : [];
    const sel = `${inputClass} w-auto py-1.5`;

    const save = async () => {
      if (!canSave) return;
      setSaving(true);
      const body: RecurringDraft = {
        title: draft.title.trim(),
        notes: draft.notes,
        priority: draft.priority,
        duration_minutes: draft.duration_minutes,
        time: draft.time,
        rule: draft.rule,
        start_date: draft.start_date,
        ...(draft.category.trim() || draft.id ? { category: draft.category.trim() } : {}),
        // 単価は入れたとき（編集では消したときも）だけ送る
        ...(parsePrice(draft.priceInput) || draft.id ? { price: parsePrice(draft.priceInput) } : {}),
      };
      const ok = draft.id ? await onUpdate(draft.id, body) : await onCreate(body);
      setSaving(false);
      if (ok) setDraft(null);
    };

    return (
      <Modal
        title={draft.id ? '定期タスクを編集' : '定期タスクを登録'}
        onClose={() => setDraft(null)}
        footer={
          <>
            <button onClick={() => setDraft(null)} className={ghostButton}>
              <ArrowLeft className="h-4 w-4" />
              戻る
            </button>
            <div className="flex-1" />
            <button onClick={() => void save()} disabled={!canSave || saving} className={primaryButton}>
              保存
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="タスク名">
            <input value={draft.title} onChange={(e) => set({ title: e.target.value })} className={inputClass} maxLength={200} autoFocus />
          </Field>

          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <Field label="分類">
              <CategorySelect value={draft.category} categories={categories} onChange={(category) => set({ category })} />
            </Field>
            <Field label="単価（任意）">
              <PriceInput value={draft.priceInput} onChange={(priceInput) => set({ priceInput })} />
            </Field>
          </div>

          <div>
            <span className="mb-1 block text-xs font-bold text-navy">繰り返し</span>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <select
                value={draft.mode}
                onChange={(e) => {
                  const mode = e.target.value as Mode;
                  set({ mode, rule: ruleFor(mode, rule, now) });
                }}
                className={sel}
                aria-label="繰り返し方"
              >
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>

              {draft.mode === 'interval' && rule.kind === 'daily' && (
                <>
                  <input
                    type="number"
                    min={2}
                    max={90}
                    value={rule.interval}
                    onChange={(e) => set({ rule: { kind: 'daily', interval: Math.min(90, Math.max(2, Number(e.target.value) || 2)) } })}
                    className={`${inputClass} w-16 py-1.5`}
                    aria-label="何日ごと"
                  />
                  日ごと
                </>
              )}

              {draft.mode === 'monthly' && rule.kind === 'monthly' && (
                <select
                  value={rule.day}
                  onChange={(e) => set({ rule: { kind: 'monthly', day: Number(e.target.value) } })}
                  className={sel}
                  aria-label="日にち"
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d}日
                    </option>
                  ))}
                  <option value={0}>末日</option>
                </select>
              )}

              {draft.mode === 'weekly' && rule.kind === 'weekly' && (
                <select
                  value={rule.interval}
                  onChange={(e) => set({ rule: { ...rule, interval: Number(e.target.value) } })}
                  className={sel}
                  aria-label="何週ごと"
                >
                  <option value={1}>毎週</option>
                  <option value={2}>隔週</option>
                  <option value={3}>3週ごと</option>
                  <option value={4}>4週ごと</option>
                </select>
              )}
            </div>

            {draft.mode === 'weekly' && rule.kind === 'weekly' && (
              <div className="mt-2 flex gap-1" role="group" aria-label="曜日">
                {WEEKDAY_ORDER.map((w) => {
                  const on = rule.weekdays.includes(w);
                  return (
                    <button
                      key={w}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        set({ rule: { ...rule, weekdays: on ? rule.weekdays.filter((x) => x !== w) : [...rule.weekdays, w] } })
                      }
                      className={`h-9 w-9 rounded-full border text-sm font-bold transition ${
                        on ? 'border-navy bg-navy text-white' : 'border-navy-100 bg-white text-navy-400 hover:border-navy-200 hover:text-navy'
                      }`}
                    >
                      {WEEKDAYS[w]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="mb-1 block text-xs font-bold text-navy">時刻</span>
              <input
                type="time"
                value={draft.time ?? ''}
                onChange={(e) => set({ time: e.target.value || null })}
                disabled={draft.time === null}
                className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400`}
                aria-label="時刻"
              />
              <label className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={draft.time === null}
                  onChange={(e) => set({ time: e.target.checked ? null : '09:00' })}
                  className="h-3.5 w-3.5 accent-navy"
                />
                時間指定なし（その日のうちに）
              </label>
            </div>
            <Field label="所要時間">
              <select
                value={draft.duration_minutes}
                onChange={(e) => set({ duration_minutes: Number(e.target.value) })}
                className={inputClass}
              >
                {DURATION_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {formatDuration(m)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="mb-1 block text-xs font-bold text-navy">優先度</span>
              <PriorityPicker value={draft.priority} onChange={(p: Priority) => set({ priority: p })} />
            </div>
            <Field label="開始日">
              <input
                type="date"
                value={draft.start_date}
                onChange={(e) => e.target.value && set({ start_date: e.target.value })}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="メモ">
            <textarea value={draft.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} className={inputClass} />
          </Field>

          {preview.length > 0 && (
            <div className="rounded-xl border border-navy-100 bg-navy-50 px-3 py-2.5 text-xs text-navy">
              <div className="mb-1 font-bold">次の予定</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
                {preview.map((d) => (
                  <span key={dayKey(d)}>
                    {d.getMonth() + 1}/{d.getDate()}({WEEKDAYS[d.getDay()]}){draft.time ? ` ${Number(draft.time.slice(0, 2))}:${draft.time.slice(3)}` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-slate-500">今日から7日先までの分が、一覧とカレンダーに自動で入ります。</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="定期タスク"
      onClose={onClose}
      footer={
        <>
          <div className="flex-1" />
          <button onClick={() => setDraft(blank(now))} className={primaryButton}>
            <Plus className="h-4 w-4" />
            新規登録
          </button>
        </>
      }
    >
      {tasks.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-500">
          <Repeat className="mx-auto mb-2 h-8 w-8 text-navy-200" aria-hidden />
          毎日・毎週・毎月行うタスクを登録すると、
          <br />
          その日の分が自動で一覧とカレンダーに入ります。
        </div>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => {
            const pr = priorityMeta(t.priority);
            return (
              <li
                key={t.id}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                  t.active ? 'border-navy-100 bg-white' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <Repeat className={`h-4 w-4 shrink-0 ${t.active ? 'text-navy' : 'text-slate-400'}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-sm font-bold ${t.active ? 'text-slate-800' : 'text-slate-500'}`}>{t.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs tabular-nums text-slate-500">
                    <span className="inline-flex items-center gap-1 rounded bg-navy-50 px-1.5 py-0.5 text-navy">
                      <Clock className="h-3 w-3" aria-hidden />
                      {recurringLabel(t)}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 font-bold ${pr.badge}`}>{pr.label}</span>
                    {t.category && (
                      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5" style={{ backgroundColor: colorOf(t.category).soft }}>
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorOf(t.category).solid }} aria-hidden />
                        <span className="text-slate-700">{t.category}</span>
                      </span>
                    )}
                    {!!t.price && <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-bold text-emerald-700">{yen(t.price)}</span>}
                    {!t.active && <span className="font-bold text-slate-500">一時停止中</span>}
                  </div>
                </div>
                <button
                  onClick={() => onSetActive(t.id, !t.active)}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-navy-50 hover:text-navy"
                  aria-label={t.active ? '一時停止' : '再開'}
                  title={t.active ? '一時停止' : '再開'}
                >
                  {t.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => setDraft({ id: t.id, title: t.title, notes: t.notes, priority: t.priority, duration_minutes: t.duration_minutes, time: t.time, rule: t.rule, start_date: t.start_date, category: t.category ?? '', priceInput: priceText(t.price), mode: modeOf(t.rule) })}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-navy-50 hover:text-navy"
                  aria-label="編集"
                  title="編集"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`「${t.title}」の定期タスクを削除しますか？\n今日以降のまだ終わっていない分も消えます（終わった分は残ります）。`)) onDelete(t.id);
                  }}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-500"
                  aria-label="削除"
                  title="削除"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
