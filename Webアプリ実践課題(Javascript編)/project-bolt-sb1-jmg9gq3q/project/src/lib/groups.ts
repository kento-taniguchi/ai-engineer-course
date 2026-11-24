import type { Todo } from '@/lib/supabase';
import { addDays, startOfDay, startOfWeek } from '@/lib/date';
import { isOverdue } from '@/lib/tasks';

export type ListFilter = 'all' | 'active' | 'done';

/** 一覧の1まとまり：コアタスク（または単独のタスク）と、その下のサブタスク */
export interface TaskGroup {
  root: Todo;
  children: Todo[];
}

export type BucketKey = 'overdue' | 'past' | 'today' | 'tomorrow' | 'week' | 'later' | 'none';

export const BUCKETS: { key: BucketKey; label: string }[] = [
  { key: 'overdue', label: '' }, // 期限切れ：文字ではなく赤で示す
  { key: 'today', label: '今日' },
  { key: 'tomorrow', label: '明日' },
  { key: 'week', label: '今週' },
  { key: 'later', label: '来週以降' },
  { key: 'none', label: '日付なし' },
  { key: 'past', label: '過去' },
];

/** 最初に開いておくまとまり */
export const DEFAULT_OPEN: BucketKey[] = ['overdue', 'today', 'tomorrow'];

const whenOf = (t: Todo) => t.scheduled_at ?? t.due_at;
const time = (iso: string | null) => (iso ? Date.parse(iso) : Number.POSITIVE_INFINITY);

const members = (g: TaskGroup) => [g.root, ...g.children];

/** まとまりの基準日時：未完了のものの中でいちばん早い日時 */
function groupDate(g: TaskGroup) {
  const all = members(g);
  const open = all.filter((t) => !t.completed);
  const times = (open.length ? open : all).map((t) => time(whenOf(t))).filter(Number.isFinite);
  return times.length ? Math.min(...times) : null;
}

export function bucketOf(g: TaskGroup, now: Date): BucketKey {
  if (members(g).some((t) => isOverdue(t, now))) return 'overdue';
  const d = groupDate(g);
  if (d === null) return 'none';
  const today = startOfDay(now).getTime();
  if (d < today) return 'past';
  if (d < addDays(startOfDay(now), 1).getTime()) return 'today';
  if (d < addDays(startOfDay(now), 2).getTime()) return 'tomorrow';
  if (d < addDays(startOfWeek(now), 7).getTime()) return 'week';
  return 'later';
}

/** タスクをコアごとにまとめ、絞り込み（未完了・完了・すべて）をかける */
export function buildGroups(todos: Todo[], filter: ListFilter): TaskGroup[] {
  const ids = new Set(todos.map((t) => t.id));
  const childrenOf = new Map<string, Todo[]>();
  for (const t of todos) {
    if (t.parent_id && ids.has(t.parent_id)) {
      const list = childrenOf.get(t.parent_id) ?? [];
      list.push(t);
      childrenOf.set(t.parent_id, list);
    }
  }

  const groups: TaskGroup[] = todos
    .filter((t) => !(t.parent_id && ids.has(t.parent_id)))
    .map((root) => ({
      root,
      children: (childrenOf.get(root.id) ?? []).sort(
        (a, b) => time(whenOf(a)) - time(whenOf(b)) || a.created_at.localeCompare(b.created_at),
      ),
    }));

  return groups.filter((g) => {
    if (filter === 'all') return true;
    const anyOpen = members(g).some((t) => !t.completed);
    return filter === 'active' ? anyOpen : !anyOpen;
  });
}

/** まとまりの中の並び：優先度が高い順 → 日時が早い順 → 新しい順 */
export function sortGroups(groups: TaskGroup[]) {
  return [...groups].sort((a, b) => {
    const pa = Math.min(...members(a).filter((t) => !t.completed).map((t) => t.priority), a.root.priority);
    const pb = Math.min(...members(b).filter((t) => !t.completed).map((t) => t.priority), b.root.priority);
    const da = groupDate(a) ?? Number.POSITIVE_INFINITY;
    const db = groupDate(b) ?? Number.POSITIVE_INFINITY;
    return pa - pb || (da === db ? 0 : da - db) || b.root.created_at.localeCompare(a.root.created_at);
  });
}
