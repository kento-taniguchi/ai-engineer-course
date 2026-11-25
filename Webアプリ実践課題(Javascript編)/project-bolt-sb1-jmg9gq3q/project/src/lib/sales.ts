import type { Todo } from '@/lib/supabase';
import { WEEKDAYS, addDays, startOfDay, startOfMonth, startOfWeek } from '@/lib/date';

/** 例：¥12,000 */
export const yen = (n: number) => `¥${Math.round(n).toLocaleString('ja-JP')}`;

/** 入力欄の文字 → 単価（空・0・数字でないときは null）。「8,000」「８０００」も読める */
export function parsePrice(text: string): number | null {
  const half = text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[,，円¥￥\s]/g, '');
  if (!/^\d+$/.test(half)) return null;
  const n = Number(half);
  return n > 0 ? n : null;
}

export const priceText = (n: number | null | undefined) => (n ? String(n) : '');

/** 売上を数える日：実施日時（カレンダーの日時）。無ければ期限の日 */
export function salesDate(t: Pick<Todo, 'scheduled_at' | 'due_at'>) {
  const iso = t.scheduled_at ?? t.due_at;
  return iso ? new Date(iso) : null;
}

export type PeriodKind = 'day' | 'week' | 'month';

/** cursor を含む 1日 / 1週間（月曜〜日曜） / 1か月。to はその次の瞬間（含まない） */
export function periodRange(kind: PeriodKind, cursor: Date) {
  if (kind === 'day') {
    const from = startOfDay(cursor);
    return { from, to: addDays(from, 1), label: `${from.getMonth() + 1}/${from.getDate()}(${WEEKDAYS[from.getDay()]})` };
  }
  if (kind === 'week') {
    const from = startOfWeek(cursor);
    const last = addDays(from, 6);
    return { from, to: addDays(from, 7), label: `${from.getMonth() + 1}/${from.getDate()}〜${last.getMonth() + 1}/${last.getDate()}` };
  }
  const from = startOfMonth(cursor);
  return { from, to: new Date(from.getFullYear(), from.getMonth() + 1, 1), label: `${from.getFullYear()}年${from.getMonth() + 1}月` };
}

export function shiftPeriod(kind: PeriodKind, cursor: Date, step: number) {
  if (kind === 'day') return addDays(cursor, step);
  if (kind === 'week') return addDays(cursor, step * 7);
  return new Date(cursor.getFullYear(), cursor.getMonth() + step, 1);
}

export interface SalesSummary {
  /** 完了した分（売上として確定） */
  done: number;
  /** まだ完了していない分も含めた見込み */
  planned: number;
  doneCount: number;
  count: number;
  /** 単価のあるタスク（日時順） */
  items: Todo[];
  /** 分類ごと（見込みの多い順） */
  byCategory: { name: string; done: number; planned: number }[];
}

/** from 以上 to 未満の日に行う、単価のあるタスクを集計する */
export function summarizeSales(todos: Todo[], from: Date, to: Date): SalesSummary {
  const items = todos
    .filter((t) => {
      if (!t.price) return false;
      const d = salesDate(t);
      return !!d && d >= from && d < to;
    })
    .sort((a, b) => salesDate(a)!.getTime() - salesDate(b)!.getTime());
  const cats = new Map<string, { done: number; planned: number }>();
  let done = 0;
  let planned = 0;
  let doneCount = 0;
  for (const t of items) {
    const p = t.price ?? 0;
    planned += p;
    if (t.completed) {
      done += p;
      doneCount++;
    }
    const c = cats.get(t.category ?? '') ?? { done: 0, planned: 0 };
    c.planned += p;
    if (t.completed) c.done += p;
    cats.set(t.category ?? '', c);
  }
  const byCategory = [...cats.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.planned - a.planned);
  return { done, planned, doneCount, count: items.length, items, byCategory };
}

export function salesOf(todos: Todo[], kind: PeriodKind, cursor: Date) {
  const { from, to } = periodRange(kind, cursor);
  return summarizeSales(todos, from, to);
}
