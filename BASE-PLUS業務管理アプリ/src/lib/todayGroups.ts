// 「今日やること」を分類（選手・チーム／発信・SNS／プチセミナー／その他の業務）にまとめ、
// 選手・チームはさらに対象者ごとの行にまとめる。
//
// 緊急性（仮のルール。第2版からの色の使い方を維持）:
//  - 赤（danger） : 指導翌日以降も未完了のフィードバック作成・送信        表示「期限超過」
//  - 黄（warning）: 期限が今日まで、または期限を過ぎた未完了の業務        表示「今日まで」「期限超過（昨日まで）」など
//  - 通常         : 期限が明日以降、または期限なし（対応日を過ぎていても「期限超過」にしない）
// 同じまとまりに複数ある場合は最も高い緊急性を表示。完了・対象外は判定に含めない。

import type { AppData, Booking, TodayCategory, Todo } from "./types";
import { bucketTodos, isOpen, todoWindow } from "./todoEngine";
import { bookingOf, targetName } from "./selectors";
import { DAY, dateKey, dateKeyOf, startOfDay } from "./time";
import { CATEGORY_LABEL, dueLabel } from "./workTasks";

export type GroupLevel = "danger" | "warning" | "normal";

export interface TodoLevel {
  level: GroupLevel;
  label: string;
}

export interface TodayGroup {
  key: string; // "player:p1" / "team:t1"
  name: string;
  isOther: boolean;
  open: Todo[];
  closed: Todo[];
  level: GroupLevel;
  label: string;
  /** 関連する指導（開始時刻順） */
  bookings: Booking[];
}

export interface TodayCategoryGroup {
  key: TodayCategory;
  name: string;
  /** 選手・チームのみ：対象者ごとの行 */
  groups: TodayGroup[];
  /** 選手・チーム以外：ToDoの一覧 */
  open: Todo[];
  closed: Todo[];
  openCount: number;
  level: GroupLevel;
  label: string;
}

const RANK: Record<GroupLevel, number> = { danger: 2, warning: 1, normal: 0 };

export function todoLevel(t: Todo, data: AppData, now: Date): TodoLevel {
  if (!isOpen(t)) return { level: "normal", label: "" };
  const today = dateKey(now);
  if (t.kind === "create_feedback" || t.kind === "send_feedback") {
    const b = bookingOf(data, t);
    if (b && dateKeyOf(b.start) < today) return { level: "danger", label: "期限超過" };
  }
  const w = todoWindow(t, data);
  if (!w || !w.due) return { level: "normal", label: "" };
  // 期限の日（期限が0時ちょうどの場合はその前日まで）
  const dueDay = dateKey(new Date(w.due.getTime() - 1));
  const endOfToday = startOfDay(today).getTime() + DAY;
  if (w.due.getTime() <= endOfToday) {
    if (dueDay < today) return { level: "warning", label: dueLabel(dueDay, today) };
    return w.due.getTime() < now.getTime() ? { level: "warning", label: "期限超過" } : { level: "warning", label: "今日まで" };
  }
  return { level: "normal", label: "" };
}

/** ToDoがどの分類に入るか */
export function categoryOf(t: Todo, data: AppData): TodayCategory {
  if (t.bookingId) return bookingOf(data, t)?.target ? "people" : "other";
  if (t.kind === "sns_task") return "sns";
  if (t.kind === "seminar_task" || t.kind === "seminar_make" || t.kind === "seminar_reserve" || t.seminarId) return "seminar";
  if (t.category === "sns") return "sns";
  if (t.category === "seminar") return "seminar";
  return "other";
}

function pickLevel(todos: Todo[], data: AppData, now: Date): TodoLevel {
  let best: TodoLevel = { level: "normal", label: "" };
  for (const t of todos) {
    const l = todoLevel(t, data, now);
    const overdue = l.label.startsWith("期限超過");
    if (RANK[l.level] > RANK[best.level] || (l.level === best.level && overdue && !best.label.startsWith("期限超過"))) best = l;
  }
  if (best.label.startsWith("期限超過")) best = { ...best, label: "期限超過" };
  return best;
}

const dueTime = (t: Todo, data: AppData) => todoWindow(t, data)?.due?.getTime() ?? Infinity;

export function buildTodayGroups(data: AppData, now: Date): TodayGroup[] {
  return buildTodayCategories(data, now).find((c) => c.key === "people")!.groups;
}

export function buildTodayCategories(data: AppData, now: Date): TodayCategoryGroup[] {
  const buckets = bucketTodos(data, now);
  const openTodos = [...buckets.overdue, ...buckets.today];

  // 展開時に確認できる完了・対象外: 表示中の指導に関係するもの＋今日完了にしたもの
  const relatedBookings = new Set(openTodos.map((t) => t.bookingId).filter(Boolean) as string[]);
  const closedTodos = data.todos.filter((t) => {
    if (isOpen(t) || t.needsReview) return false;
    if (t.bookingId && relatedBookings.has(t.bookingId)) return true;
    return buckets.closedToday.some((c) => c.id === t.id);
  });

  // 選手・チーム：対象者ごと
  const map = new Map<string, TodayGroup>();
  const ensure = (key: string): TodayGroup => {
    let g = map.get(key);
    if (!g) {
      const [type, id] = key.split(":");
      g = { key, name: targetName(data, { type: type as "player" | "team", id }), isOther: false, open: [], closed: [], level: "normal", label: "", bookings: [] };
      map.set(key, g);
    }
    return g;
  };
  const byCat: Record<TodayCategory, { open: Todo[]; closed: Todo[] }> = {
    people: { open: [], closed: [] },
    sns: { open: [], closed: [] },
    seminar: { open: [], closed: [] },
    other: { open: [], closed: [] },
  };
  for (const t of openTodos) {
    const c = categoryOf(t, data);
    byCat[c].open.push(t);
    if (c === "people") {
      const b = bookingOf(data, t)!;
      ensure(`${b.target!.type}:${b.target!.id}`).open.push(t);
    }
  }
  for (const t of closedTodos) {
    const c = categoryOf(t, data);
    byCat[c].closed.push(t);
    if (c === "people") {
      const b = bookingOf(data, t)!;
      ensure(`${b.target!.type}:${b.target!.id}`).closed.push(t);
    }
  }
  for (const g of map.values()) {
    const l = pickLevel(g.open, data, now);
    g.level = l.level;
    g.label = l.label;
    const ids = new Set([...g.open, ...g.closed].map((t) => t.bookingId).filter(Boolean));
    g.bookings = data.bookings.filter((b) => ids.has(b.id)).sort((a, b) => a.start.localeCompare(b.start));
    g.open.sort((a, b) => dueTime(a, data) - dueTime(b, data));
    g.closed.sort((a, b) => (b.statusChangedAt ?? "").localeCompare(a.statusChangedAt ?? ""));
  }
  const firstDue = (g: TodayGroup) => (g.open[0] ? dueTime(g.open[0], data) : Infinity);
  const groups = [...map.values()].sort((a, b) => {
    if ((a.open.length > 0) !== (b.open.length > 0)) return a.open.length > 0 ? -1 : 1;
    if (RANK[a.level] !== RANK[b.level]) return RANK[b.level] - RANK[a.level];
    return firstDue(a) - firstDue(b);
  });

  const cats: TodayCategory[] = ["people", "sns", "seminar", "other"];
  return cats.map((key) => {
    const { open, closed } = byCat[key];
    open.sort((a, b) => {
      const la = RANK[todoLevel(a, data, now).level];
      const lb = RANK[todoLevel(b, data, now).level];
      return lb - la || dueTime(a, data) - dueTime(b, data);
    });
    closed.sort((a, b) => (b.statusChangedAt ?? "").localeCompare(a.statusChangedAt ?? ""));
    const l = pickLevel(open, data, now);
    return { key, name: CATEGORY_LABEL[key], groups: key === "people" ? groups : [], open, closed, openCount: open.length, level: l.level, label: l.label };
  });
}
