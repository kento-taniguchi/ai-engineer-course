import { useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, JapaneseYen } from 'lucide-react';
import type { Todo } from '@/lib/supabase';
import { WEEKDAYS, addDays, dayKey, formatTime, isSameDay } from '@/lib/date';
import { periodRange, salesDate, salesOf, shiftPeriod, summarizeSales, yen, type PeriodKind } from '@/lib/sales';
import { UNCATEGORIZED_COLOR, type CategoryColor } from '@/lib/colors';
import { Modal } from '@/components/ui';

const KINDS: { value: PeriodKind; label: string; now: string }[] = [
  { value: 'day', label: '日', now: '今日' },
  { value: 'week', label: '週', now: '今週' },
  { value: 'month', label: '月', now: '今月' },
];

/** 一覧の上に出す「今日・今週・今月の売上」 */
export function SalesStrip({ todos, now, onOpen }: { todos: Todo[]; now: Date; onOpen: (kind: PeriodKind) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5 border-b border-navy-100 px-3 py-2">
      {KINDS.map((k) => {
        const s = salesOf(todos, k.value, now);
        return (
          <button
            key={k.value}
            onClick={() => onOpen(k.value)}
            className="min-w-0 rounded-lg border border-navy-100 bg-canvas px-2 py-1 text-left transition hover:border-navy-200 hover:bg-navy-50"
            title={`${k.now}の売上を詳しく見る`}
          >
            <div className="flex items-center gap-1 text-[11px] font-bold text-navy-400">
              <JapaneseYen className="h-3 w-3" aria-hidden />
              {k.now}の売上
            </div>
            <div className="truncate text-sm font-bold tabular-nums text-navy">{yen(s.done)}</div>
            <div className="truncate text-[10px] tabular-nums text-slate-500">見込み {yen(s.planned)}</div>
          </button>
        );
      })}
    </div>
  );
}

interface DialogProps {
  todos: Todo[];
  now: Date;
  initialKind: PeriodKind;
  colorOf: (category: string) => CategoryColor;
  onOpenTask: (id: string) => void;
  onClose: () => void;
}

/** 売上の詳しい画面：日・週・月を切り替えて、前後の期間も見られる */
export function SalesDialog({ todos, now, initialKind, colorOf, onOpenTask, onClose }: DialogProps) {
  const [kind, setKind] = useState<PeriodKind>(initialKind);
  const [cursor, setCursor] = useState(now);
  const { from, to, label } = periodRange(kind, cursor);
  const s = summarizeSales(todos, from, to);
  const isCurrent = now >= from && now < to;

  // 週・月は、日ごとの売上を棒で見せる
  const days: { day: Date; done: number; planned: number }[] = [];
  if (kind !== 'day') {
    for (let d = from; d < to; d = addDays(d, 1)) {
      const one = summarizeSales(s.items, d, addDays(d, 1));
      days.push({ day: d, done: one.done, planned: one.planned });
    }
  }
  const maxDay = Math.max(1, ...days.map((d) => d.planned));
  const maxCat = Math.max(1, ...s.byCategory.map((c) => c.planned));

  return (
    <Modal title="売上" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-navy-100 bg-white p-0.5" role="tablist" aria-label="期間">
            {KINDS.map((k) => (
              <button
                key={k.value}
                role="tab"
                aria-selected={kind === k.value}
                onClick={() => {
                  setKind(k.value);
                  setCursor(now);
                }}
                className={`rounded-md px-3 py-1 text-xs font-bold transition ${kind === k.value ? 'bg-navy text-white' : 'text-navy-400 hover:bg-navy-50'}`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div className="flex items-center">
            <button onClick={() => setCursor(shiftPeriod(kind, cursor, -1))} className="rounded-lg p-1.5 text-navy hover:bg-navy-50" aria-label="前へ">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[8.5rem] text-center text-sm font-bold tabular-nums text-navy">{label}</span>
            <button onClick={() => setCursor(shiftPeriod(kind, cursor, 1))} className="rounded-lg p-1.5 text-navy hover:bg-navy-50" aria-label="次へ">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {!isCurrent && (
            <button onClick={() => setCursor(now)} className="rounded-md px-2 py-1 text-xs text-navy-400 hover:bg-navy-50 hover:text-navy">
              {KINDS.find((k) => k.value === kind)!.now}に戻る
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="売上（完了した分）" value={yen(s.done)} strong />
          <Stat label="見込み（予定を含む）" value={yen(s.planned)} />
          <Stat label="件数（完了／全部）" value={`${s.doneCount} / ${s.count}件`} />
        </div>

        {s.byCategory.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-xs font-bold text-navy">事業ごと</h3>
            <ul className="space-y-1.5">
              {s.byCategory.map((c) => {
                const color = c.name ? colorOf(c.name) : UNCATEGORIZED_COLOR;
                return (
                  <li key={c.name} className="grid grid-cols-[7rem_1fr_auto] items-center gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5 text-slate-700">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color.solid }} aria-hidden />
                      <span className="truncate">{c.name || '未分類'}</span>
                    </span>
                    <Bar done={c.done} planned={c.planned} max={maxCat} color={color.solid} />
                    <span className="text-right tabular-nums text-slate-700">
                      <b className="text-navy">{yen(c.done)}</b>
                      <span className="text-slate-500"> / {yen(c.planned)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {kind !== 'day' && s.count > 0 && (
          <section>
            <h3 className="mb-1.5 text-xs font-bold text-navy">日ごと</h3>
            <ul className={`grid gap-x-4 gap-y-1 ${kind === 'month' ? 'sm:grid-cols-2' : ''}`}>
              {days.map((d) => (
                <li key={dayKey(d.day)} className="grid grid-cols-[4.5rem_1fr_4.5rem] items-center gap-2 text-xs">
                  <button
                    onClick={() => {
                      setKind('day');
                      setCursor(d.day);
                    }}
                    className={`rounded text-left tabular-nums hover:underline ${
                      isSameDay(d.day, now) ? 'font-bold text-accent-600' : d.day.getDay() === 0 ? 'text-red-600' : d.day.getDay() === 6 ? 'text-sky-700' : 'text-slate-600'
                    }`}
                  >
                    {d.day.getMonth() + 1}/{d.day.getDate()}({WEEKDAYS[d.day.getDay()]})
                  </button>
                  <Bar done={d.done} planned={d.planned} max={maxDay} color="#1E3A8A" />
                  <span className={`text-right tabular-nums ${d.planned ? 'text-slate-700' : 'text-slate-300'}`}>{yen(d.planned)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="mb-1.5 text-xs font-bold text-navy">単価のある予定</h3>
          {s.items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-navy-100 px-3 py-4 text-center text-xs text-slate-500">
              この期間に単価のある予定はありません。タスクの編集画面で「単価」を入れると、ここに出ます。
            </p>
          ) : (
            <ul className="divide-y divide-navy-50 rounded-lg border border-navy-100">
              {s.items.map((t) => {
                const d = salesDate(t)!;
                const color = t.category ? colorOf(t.category) : UNCATEGORIZED_COLOR;
                return (
                  <li key={t.id}>
                    <button onClick={() => onOpenTask(t.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-navy-50">
                      {t.completed ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-navy" aria-label="完了" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 shrink-0 text-navy-200" aria-label="未完了" />
                      )}
                      <span className="w-[5.5rem] shrink-0 tabular-nums text-slate-500">
                        {d.getMonth() + 1}/{d.getDate()}({WEEKDAYS[d.getDay()]}) {t.scheduled_at ? formatTime(d) : ''}
                      </span>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color.solid }} aria-hidden />
                      <span className={`min-w-0 flex-1 truncate ${t.completed ? 'text-slate-800' : 'text-slate-500'}`}>{t.title}</span>
                      <span className={`shrink-0 font-bold tabular-nums ${t.completed ? 'text-navy' : 'text-slate-500'}`}>{yen(t.price ?? 0)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-slate-500">
            売上は「完了」にした予定の単価の合計です。日付はカレンダーの日時（なければ期限）で数えます。週は月曜〜日曜です。
          </p>
        </section>
      </div>
    </Modal>
  );
}

function Stat({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${strong ? 'border-navy bg-navy text-white' : 'border-navy-100 bg-canvas'}`}>
      <div className={`text-[11px] ${strong ? 'text-navy-100' : 'text-slate-500'}`}>{label}</div>
      <div className={`truncate text-lg font-bold tabular-nums ${strong ? '' : 'text-navy'}`}>{value}</div>
    </div>
  );
}

/** 濃い部分 = 完了した分、薄い部分 = 見込み */
function Bar({ done, planned, max, color }: { done: number; planned: number; max: number; color: string }) {
  return (
    <span className="relative h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
      <span className="absolute inset-y-0 left-0 rounded-full opacity-30" style={{ width: `${(planned / max) * 100}%`, backgroundColor: color }} />
      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(done / max) * 100}%`, backgroundColor: color }} />
    </span>
  );
}
