import type { NewTodo, RecurrenceRule, RecurringTask } from '@/lib/supabase';
import { WEEKDAYS, addDays, dayKey, startOfDay, startOfWeek } from '@/lib/date';

/** 今日から何日先の分までタスクを作っておくか（今日を含めて7日分） */
export const LOOKAHEAD_DAYS = 6;

export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 月〜日の順に並べる
const WORKDAYS = [1, 2, 3, 4, 5];

/** "YYYY-MM-DD" をその日の 0:00（端末の時刻）にする */
export function parseDay(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);

const isLastDayOfMonth = (d: Date) => addDays(d, 1).getDate() === 1;

/** その日が繰り返しに当たるか */
export function matchesRule(rule: RecurrenceRule, day: Date, start: Date) {
  const diff = daysBetween(start, day);
  if (diff < 0) return false;
  switch (rule.kind) {
    case 'daily':
      return diff % Math.max(1, rule.interval) === 0;
    case 'weekly': {
      if (!rule.weekdays.includes(day.getDay())) return false;
      const weeks = Math.round(daysBetween(startOfWeek(start), startOfWeek(day)) / 7);
      return weeks % Math.max(1, rule.interval) === 0;
    }
    case 'monthly':
      return rule.day === 0 ? isLastDayOfMonth(day) : day.getDate() === rule.day;
  }
}

/** 繰り返し方を日本語で表す：毎日／3日ごと／平日／毎週 月・木／隔週 火／毎月15日／毎月末日 */
export function ruleLabel(rule: RecurrenceRule) {
  switch (rule.kind) {
    case 'daily':
      return rule.interval <= 1 ? '毎日' : `${rule.interval}日ごと`;
    case 'weekly': {
      const sorted = WEEKDAY_ORDER.filter((w) => rule.weekdays.includes(w));
      const isWorkdays = sorted.length === 5 && WORKDAYS.every((w) => sorted.includes(w));
      if (rule.interval <= 1 && isWorkdays) return '平日';
      if (rule.interval <= 1 && sorted.length === 7) return '毎日';
      const prefix = rule.interval <= 1 ? '毎週' : rule.interval === 2 ? '隔週' : `${rule.interval}週ごと`;
      return `${prefix} ${sorted.map((w) => WEEKDAYS[w]).join('・')}`;
    }
    case 'monthly':
      return rule.day === 0 ? '毎月末日' : `毎月${rule.day}日`;
  }
}

export function recurringLabel(r: Pick<RecurringTask, 'rule' | 'time'>) {
  return `${ruleLabel(r.rule)}${r.time ? ` ${Number(r.time.slice(0, 2))}:${r.time.slice(3)}` : ''}`;
}

/** from〜to（その日を含む）の中で、繰り返しに当たる日 */
export function occurrencesBetween(r: Pick<RecurringTask, 'rule' | 'start_date'>, from: Date, to: Date) {
  const start = parseDay(r.start_date);
  const out: Date[] = [];
  for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) {
    if (matchesRule(r.rule, d, start)) out.push(d);
  }
  return out;
}

/** 次に当たる日を n 件（プレビュー用。1年先まで探す） */
export function nextOccurrences(r: Pick<RecurringTask, 'rule' | 'start_date'>, from: Date, n: number) {
  const start = parseDay(r.start_date);
  const out: Date[] = [];
  let d = startOfDay(from < start ? start : from);
  for (let i = 0; i < 366 && out.length < n; i++, d = addDays(d, 1)) {
    if (matchesRule(r.rule, d, start)) out.push(d);
  }
  return out;
}

/**
 * その日の分のタスクを作る
 * - 時刻あり：その時刻にカレンダーへ入れ、終わる時刻を期限にする
 * - 時刻なし：カレンダーには入れず、その日の 23:59 を期限にする
 */
export function buildOccurrence(r: RecurringTask, day: Date): NewTodo {
  let scheduled: Date | null = null;
  let due: Date;
  if (r.time) {
    scheduled = new Date(day);
    scheduled.setHours(Number(r.time.slice(0, 2)), Number(r.time.slice(3, 5)), 0, 0);
    due = new Date(scheduled.getTime() + r.duration_minutes * 60_000);
  } else {
    due = new Date(day);
    due.setHours(23, 59, 0, 0);
  }
  return {
    title: r.title,
    notes: r.notes,
    ...(r.category?.trim() ? { category: r.category.trim() } : {}),
    priority: r.priority,
    duration_minutes: r.duration_minutes,
    ...(r.price ? { price: r.price } : {}),
    scheduled_at: scheduled?.toISOString() ?? null,
    due_at: due.toISOString(),
    recurrence_id: r.id,
    occurs_on: dayKey(day),
  };
}

/**
 * まだ作っていない日の分をまとめて作る
 * 作り始めは「今日」と「前回作った日の翌日」の遅いほう。休んでいた日の分はさかのぼって作らない。
 */
export function pendingOccurrences(r: RecurringTask, today: Date) {
  const until = addDays(startOfDay(today), LOOKAHEAD_DAYS);
  let from = startOfDay(today);
  if (r.generated_until) {
    const next = addDays(parseDay(r.generated_until), 1);
    if (next > from) from = next;
  }
  if (!r.active || from > until) return { items: [] as NewTodo[], until: null };
  return { items: occurrencesBetween(r, from, until).map((d) => buildOccurrence(r, d)), until: dayKey(until) };
}
