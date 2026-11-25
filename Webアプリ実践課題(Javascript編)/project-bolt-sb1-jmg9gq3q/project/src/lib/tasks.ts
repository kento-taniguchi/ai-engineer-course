import type { ItemTiming, NewTodo, Priority, TaskTemplate, TemplateItem, Todo } from '@/lib/supabase';
import { addDays, isSameDay, startOfDay } from '@/lib/date';
import { fillCustomer } from '@/lib/customer';

export const PRIORITIES: { value: Priority; label: string; badge: string; stripe: string }[] = [
  { value: 1, label: '高', badge: 'bg-accent text-navy-900', stripe: 'bg-accent' },
  { value: 2, label: '中', badge: 'bg-navy-100 text-navy', stripe: 'bg-navy-300' },
  { value: 3, label: '低', badge: 'bg-slate-100 text-slate-500', stripe: 'bg-slate-300' },
];

export const priorityMeta = (p: Priority) => PRIORITIES.find((x) => x.value === p) ?? PRIORITIES[1];

export function isOverdue(todo: Todo, now: Date) {
  return !todo.completed && !!todo.due_at && new Date(todo.due_at).getTime() < now.getTime();
}

const dueValue = (t: Todo) => (t.due_at ? Date.parse(t.due_at) : Number.POSITIVE_INFINITY);

/** 未完了 → 優先度が高い順 → 期限が近い順 → 新しい順 */
export function sortTodos(list: Todo[]) {
  return [...list].sort(
    (a, b) =>
      Number(a.completed) - Number(b.completed) ||
      a.priority - b.priority ||
      (dueValue(a) === dueValue(b) ? 0 : dueValue(a) - dueValue(b)) ||
      b.created_at.localeCompare(a.created_at),
  );
}

/** -1 → 前日、0 → 当日、1 → 翌日、3 → 3日後 */
export function dayLabel(n: number) {
  if (n === 0) return '当日';
  if (n === -1) return '前日';
  if (n === 1) return '翌日';
  return n < 0 ? `${-n}日前` : `${n}日後`;
}

export const DAY_OFFSETS = [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7];

/** 例：「実施の1時間後」「翌日 9:00」 */
export function timingLabel(t: ItemTiming) {
  if (t.kind === 'none') return '時間指定なし';
  if (t.kind === 'day') return `${dayLabel(t.days)} ${t.time.replace(/^0/, '')}`;
  if (t.minutes === 0) return '実施と同時';
  const a = Math.abs(t.minutes);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `実施の${h ? `${h}時間` : ''}${m ? `${m}分` : ''}${t.minutes < 0 ? '前' : '後'}`;
}

/** コアの実施日時 base から、サブタスクの日時を計算する */
export function computeTiming(t: ItemTiming | null | undefined, base: Date): Date | null {
  if (!t || t.kind === 'none') return null;
  if (t.kind === 'offset') return new Date(base.getTime() + t.minutes * 60_000);
  const d = startOfDay(addDays(base, t.days));
  const [h, m] = t.time.split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

type RawItem = Partial<TemplateItem> & { due_offset_days?: number | null; due_time?: string };

/** 保存済みテンプレートの1行を今の形式にそろえる（前の版の「実施日の○日前」形式も読み替える） */
export function normalizeItem(raw: RawItem): TemplateItem {
  let timing: ItemTiming = { kind: 'none' };
  if (raw.timing && (raw.timing.kind === 'none' || raw.timing.kind === 'offset' || raw.timing.kind === 'day')) {
    timing = raw.timing;
  } else if (typeof raw.due_offset_days === 'number') {
    timing = { kind: 'day', days: raw.due_offset_days, time: raw.due_time || '18:00' };
  }
  return {
    title: raw.title ?? '',
    priority: raw.priority ?? 2,
    duration_minutes: raw.duration_minutes || 60,
    timing,
    price: typeof raw.price === 'number' && raw.price > 0 ? raw.price : null,
  };
}

export const isSet = (t: TaskTemplate) => t.items.length > 1;

/**
 * テンプレート（またはセット）から登録用のタスクを作る。
 * base はコアタスクの実施日時。null ならカレンダーに入れない（1件だけのテンプレート用）。
 * 時刻が決まるタスクは、その時刻でカレンダーに入り、同じ時刻が期限になる。
 * customer を渡すと、文中の {お客さん} をその名前に置き換える。分類はテンプレートの分類を引き継ぐ。
 */
export function buildFromTemplate(t: TaskTemplate, base: Date | null, customer = ''): { core: NewTodo; subs: NewTodo[] } {
  const [coreItem, ...subItems] = t.items;
  const set_name = isSet(t) ? fillCustomer(t.name, customer) : null;
  const category = t.category.trim();
  const duration = coreItem.duration_minutes || 60;

  // 分類は付いているときだけ送る（未分類は送らない）
  const withCategory = category ? { category } : {};

  const core: NewTodo = {
    title: fillCustomer(coreItem.title, customer),
    ...withCategory,
    priority: coreItem.priority,
    duration_minutes: duration,
    // 単価は付いているときだけ送る
    ...(coreItem.price ? { price: coreItem.price } : {}),
    set_name,
    scheduled_at: base ? base.toISOString() : null,
    // コアは終了時刻を期限にする
    due_at: base ? new Date(base.getTime() + duration * 60_000).toISOString() : null,
  };

  const subs: NewTodo[] = subItems.map((it) => {
    const at = base ? computeTiming(it.timing, base) : null;
    return {
      title: fillCustomer(it.title, customer),
      ...withCategory,
      priority: it.priority,
      duration_minutes: it.duration_minutes || 30,
      ...(it.price ? { price: it.price } : {}),
      set_name,
      timing: it.timing,
      scheduled_at: at ? at.toISOString() : null,
      due_at: at ? at.toISOString() : null,
    };
  });

  return { core, subs };
}

export interface PlacedEvent {
  todo: Todo;
  start: number;
  end: number;
  col: number;
  cols: number;
}

/** その日のカレンダー予定を取り出し、重なりを横に並べる位置を計算する */
export function layoutDayEvents(todos: Todo[], day: Date): PlacedEvent[] {
  const items: PlacedEvent[] = todos
    .filter((t) => t.scheduled_at && isSameDay(new Date(t.scheduled_at), day))
    .map((t) => {
      const s = new Date(t.scheduled_at!);
      const start = s.getHours() * 60 + s.getMinutes();
      return { todo: t, start, end: Math.min(1440, start + Math.max(t.duration_minutes, 15)), col: 0, cols: 1 };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  let cluster: PlacedEvent[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const p of cluster) p.cols = colEnds.length;
    cluster = [];
    colEnds = [];
  };
  for (const it of items) {
    if (cluster.length && it.start >= clusterEnd) flush();
    let c = colEnds.findIndex((e) => e <= it.start);
    if (c === -1) {
      c = colEnds.length;
      colEnds.push(it.end);
    } else {
      colEnds[c] = it.end;
    }
    it.col = c;
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return items;
}

/** その日が期限の未完了タスク */
export function dueOn(todos: Todo[], day: Date) {
  return sortTodos(todos.filter((t) => !t.completed && t.due_at && isSameDay(new Date(t.due_at), day)));
}
