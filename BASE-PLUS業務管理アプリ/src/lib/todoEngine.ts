// 予約（指導予定）からToDoを生成・更新するロジック。
// 画面のコードから分離しているため、将来Googleカレンダーから予約を読み込んだ場合も同じ関数を使えます。

import type { AppData, Booking, SeminarEpisode, SnsTaskKey, Todo, TodoKind, TodoStatus } from "./types";
import { BACKFILL_DAYS, dueForOccurrence, occurrences, ruleForEpisode, seminarRuleTask, seminarTaskDate, taskTodoId } from "./workTasks";
import { DAY, HOUR, addDaysKey, dateKey, dateKeyOf, diffDays, startOfDay, toISO, weekdayOf } from "./time";

export const BOOKING_TODO_KINDS: TodoKind[] = [
  "review_prev",
  "lesson_plan",
  "remind",
  "create_feedback",
  "send_feedback",
  "thanks",
];

export const TODO_LABEL: Record<TodoKind, string> = {
  review_prev: "前回記録を確認",
  lesson_plan: "今回の指導内容をメモ",
  remind: "リマインドを送る",
  create_feedback: "フィードバックを作成",
  send_feedback: "フィードバックを送る",
  thanks: "お礼を送る",
  sns_task: "SNSの作業",
  seminar_task: "プチセミナーの作業",
  seminar_make: "プチセミナー動画を作成",
  seminar_reserve: "プチセミナー配信予約の準備",
  manual: "ToDo",
};

export const TODO_ACTION_LABEL: Record<TodoKind, string> = {
  review_prev: "前回記録を開く",
  lesson_plan: "メモを書く",
  remind: "下書きを確認",
  create_feedback: "レポートを作成",
  send_feedback: "レポートを確認・共有",
  thanks: "下書きを確認",
  sns_task: "SNS企画を開く",
  seminar_task: "セミナー詳細へ",
  seminar_make: "セミナー画面へ",
  seminar_reserve: "セミナー画面へ",
  manual: "開く",
};

/** ToDoを作業時間として配置するときの標準所要時間（分） */
export const DEFAULT_DURATION: Record<TodoKind, number> = {
  review_prev: 15,
  lesson_plan: 15,
  remind: 5,
  create_feedback: 30,
  send_feedback: 10,
  thanks: 5,
  sns_task: 30,
  seminar_task: 30,
  seminar_make: 60,
  seminar_reserve: 15,
  manual: 30,
};

export const STATUS_LABEL: Record<TodoStatus, string> = {
  todo: "未着手",
  scheduled: "予定に入れた",
  doing: "作業中",
  done: "完了",
  na: "対象外",
};

/** 色だけに頼らないためのアイコン（文字記号） */
export const STATUS_ICON: Record<TodoStatus, string> = {
  todo: "○",
  scheduled: "◷",
  doing: "▶",
  done: "✓",
  na: "－",
};

export const OPEN_STATUSES: TodoStatus[] = ["todo", "scheduled", "doing"];

export function isOpen(t: Todo): boolean {
  return OPEN_STATUSES.includes(t.status);
}

export function bookingTodoId(bookingId: string, kind: TodoKind): string {
  return `${bookingId}:${kind}`;
}

// ---------- 表示タイミング ----------

export interface TodoWindow {
  /** この時刻からToDoとして表示する */
  visibleFrom: Date;
  /** 期限（これを過ぎて未完了なら期限切れ）。null は期限なし（「期限超過」にならない） */
  due: Date | null;
}

/**
 * 予約日時に応じたToDoの表示開始・期限。
 * 予約の日時を変更（延期）すると、未完了のToDoは自動的に新しい日時に合わせて表示されます。
 */
export function bookingTodoWindow(kind: TodoKind, b: Booking): TodoWindow {
  const start = new Date(b.start);
  const end = new Date(b.end);
  const lessonDay = dateKeyOf(b.start);
  const dayStart = startOfDay(lessonDay);
  const nextDayStart = new Date(dayStart.getTime() + DAY);
  switch (kind) {
    case "review_prev": // 指導前日から
    case "lesson_plan": // 前回記録の確認とは別の作業として、同じく指導前日から
      return { visibleFrom: new Date(dayStart.getTime() - DAY), due: start };
    case "remind": // 指導当日の午前（0時から表示、正午まで）
      return {
        visibleFrom: dayStart,
        due: new Date(Math.min(dayStart.getTime() + 12 * HOUR, start.getTime())),
      };
    case "create_feedback":
    case "send_feedback": // 指導終了直後から、当日中
      return { visibleFrom: end, due: nextDayStart };
    case "thanks": // 指導終了1時間後から、当日中
      return { visibleFrom: new Date(end.getTime() + HOUR), due: nextDayStart };
    default:
      return { visibleFrom: dayStart, due: nextDayStart };
  }
}

/** プチセミナーのToDo表示日（仮の仕様: 月曜配信→土曜、金曜配信→木曜に作成・予約準備） */
export function seminarWorkDay(ep: SeminarEpisode): string {
  const wd = weekdayOf(ep.deliveryDate);
  if (wd === 1) return addDaysKey(ep.deliveryDate, -2); // 月曜 → 土曜
  if (wd === 5) return addDaysKey(ep.deliveryDate, -1); // 金曜 → 木曜
  return addDaysKey(ep.deliveryDate, -1);
}

function baseWindow(t: Todo, data: AppData): TodoWindow | null {
  if (t.bookingId) {
    const b = data.bookings.find((x) => x.id === t.bookingId);
    return b ? bookingTodoWindow(t.kind, b) : null;
  }
  if (t.kind === "sns_task") {
    // SNS：作業ごとに設定した対応日・期限（どちらも未設定なら表示しない＝勝手に日付を決めない）
    const r = data.reels.find((x) => x.id === t.reelId);
    const sc = t.snsKey ? r?.taskSchedule?.[t.snsKey] : undefined;
    const work = sc?.workDate ?? sc?.dueDate;
    if (!r || !work) return null;
    return { visibleFrom: startOfDay(work), due: sc?.dueDate ? new Date(startOfDay(sc.dueDate).getTime() + DAY) : null };
  }
  if (t.seminarId) {
    const ep = data.seminars.find((x) => x.id === t.seminarId);
    if (!ep) return null;
    if (t.kind === "seminar_task") {
      const rt = seminarRuleTask(data.seminarRules ?? [], ep, t.seminarTaskKey);
      // ルールから外した作業は、未完了なら表示しない（完了済みの履歴は残る）
      const work = rt ? seminarTaskDate(ep, rt) : isOpen(t) ? null : seminarWorkDay(ep);
      if (!work) return null;
      return { visibleFrom: startOfDay(work), due: startOfDay(ep.deliveryDate) };
    }
    const work = startOfDay(seminarWorkDay(ep));
    return { visibleFrom: work, due: startOfDay(ep.deliveryDate) };
  }
  if (t.taskId || t.workDate) {
    // 手動で追加した仕事：対応日から表示。期限は任意
    const work = t.workDate ?? t.occurrence ?? dateKeyOf(t.createdAt);
    return { visibleFrom: startOfDay(work), due: t.dueDate ? new Date(startOfDay(t.dueDate).getTime() + DAY) : null };
  }
  const created = startOfDay(dateKeyOf(t.createdAt));
  return { visibleFrom: created, due: new Date(created.getTime() + DAY) };
}

export function todoWindow(t: Todo, data: AppData): TodoWindow | null {
  const w = baseWindow(t, data);
  if (!w) return null;
  // 「後日に変更」した場合は、その日から表示（期限は変えない）
  if (t.postponedTo) {
    const p = startOfDay(t.postponedTo);
    if (p.getTime() > w.visibleFrom.getTime()) return { ...w, visibleFrom: p };
  }
  return w;
}

// ---------- 緊急度 ----------

export type Urgency = "normal" | "warning" | "danger";

export interface UrgencyInfo {
  level: Urgency;
  label: string;
}

/**
 * フィードバック作成・送信: 当日は通常、翌日は黄色「翌日」、2日以上は赤「◯日経過」。
 * その他: 期限を過ぎていたら黄色「期限切れ」。
 */
export function urgencyOf(t: Todo, data: AppData, now: Date): UrgencyInfo {
  if (!isOpen(t)) return { level: "normal", label: "" };
  const w = todoWindow(t, data);
  if (!w) return { level: "normal", label: "" };
  if (t.kind === "create_feedback" || t.kind === "send_feedback") {
    const b = data.bookings.find((x) => x.id === t.bookingId);
    if (!b) return { level: "normal", label: "" };
    const days = diffDays(dateKey(now), dateKeyOf(b.start));
    const what = t.kind === "create_feedback" ? "未作成" : "未送信";
    if (days === 1) return { level: "warning", label: `翌日・${what}` };
    if (days >= 2) return { level: "danger", label: `${days}日経過・${what}` };
    return { level: "normal", label: "" };
  }
  if (w.due && w.due.getTime() < now.getTime()) {
    const days = diffDays(dateKey(now), dateKey(w.due));
    return { level: days >= 2 ? "danger" : "warning", label: "期限切れ" };
  }
  return { level: "normal", label: "" };
}

// ---------- 生成（同期） ----------

function newTodo(id: string, kind: TodoKind, now: Date, extra: Partial<Todo>): Todo {
  return {
    id,
    kind,
    status: "todo",
    statusReason: "",
    history: [],
    createdAt: toISO(now),
    ...extra,
  };
}

/**
 * 予約・セミナーから必要なToDoを補充する。
 * - IDが「予約ID:種類」で固定なので、何度実行しても重複しない（再同期でも安全）
 * - 既存のToDo（完了済みを含む）は変更・削除しない
 * - キャンセル・削除された予約、対象者が未確定の予約からは新規作成しない
 */
export function ensureTodos(data: AppData, now: Date): AppData {
  const existing = new Set(data.todos.map((t) => t.id));
  const added: Todo[] = [];
  for (const b of data.bookings) {
    if (b.status !== "scheduled" || !b.target) continue;
    for (const kind of BOOKING_TODO_KINDS) {
      const id = bookingTodoId(b.id, kind);
      // 第3版で追加した「今回の指導内容をメモ」は、すでに始まった予約には作らない（過去分が溜まらないように）
      if (kind === "lesson_plan" && new Date(b.start).getTime() <= now.getTime()) continue;
      if (!existing.has(id)) {
        added.push(newTodo(id, kind, now, { bookingId: b.id }));
        existing.add(id);
      }
    }
  }
  // プチセミナー：配信曜日ごとのルールに沿って、配信回ごとに作る（ID固定で重複しない）
  for (const ep of data.seminars) {
    if (ep.status === "delivered") continue;
    const rule = ruleForEpisode(data.seminarRules ?? [], ep);
    for (const rt of rule?.tasks ?? []) {
      const id = `seminar:${ep.id}:task:${rt.key}`;
      if (!existing.has(id)) {
        added.push(newTodo(id, "seminar_task", now, { seminarId: ep.id, seminarTaskKey: rt.key }));
        existing.add(id);
      }
    }
  }
  // SNS：対応日か期限を設定した作業だけ作る
  for (const r of data.reels ?? []) {
    for (const [key, sc] of Object.entries(r.taskSchedule ?? {}) as [SnsTaskKey, { workDate?: string; dueDate?: string }][]) {
      if (!sc?.workDate && !sc?.dueDate) continue;
      const id = `reel:${r.id}:${key}`;
      if (!existing.has(id)) {
        added.push(newTodo(id, "sns_task", now, { reelId: r.id, snsKey: key }));
        existing.add(id);
      }
    }
  }
  // 手動の仕事：今日までに発生した回を作る（繰り返しは各回を「仕事ID:日付」で区別）
  const today = dateKey(now);
  for (const task of data.tasks ?? []) {
    const from = task.repeat.type === "none" ? task.date : addDaysKey(today, -BACKFILL_DAYS);
    const to = task.repeat.type === "none" ? task.date : today;
    for (const occ of occurrences(task, from, to)) {
      const id = taskTodoId(task.id, occ);
      if (!existing.has(id)) {
        added.push(
          newTodo(id, "manual", now, {
            taskId: task.id,
            occurrence: occ,
            title: task.title,
            category: task.category,
            workDate: occ,
            dueDate: dueForOccurrence(task, occ),
            durationMin: task.durationMin,
            memo: task.memo,
          }),
        );
        existing.add(id);
      }
    }
  }
  return added.length ? { ...data, todos: [...data.todos, ...added] } : data;
}

// ---------- 状態変更 ----------

export function changeTodoStatus(t: Todo, to: TodoStatus, reason: string, now: Date): Todo {
  if (t.status === to && t.statusReason === reason) return t;
  return {
    ...t,
    status: to,
    statusReason: reason,
    statusChangedAt: toISO(now),
    history: [...t.history, { at: toISO(now), from: t.status, to, reason }],
    // 完了・対象外にしたら「確認が必要」は解消
    needsReview: to === "done" || to === "na" ? undefined : t.needsReview,
  };
}

// ---------- 予約の変更・キャンセル・削除 ----------

/**
 * 予約が変更されたときにToDoをどう扱うか（設計）:
 *
 * 【日時変更・延期】
 *  - 未完了のToDo: 表示タイミングは新しい日時から自動計算されるので、そのまま追従。
 *    ただし作業時間を配置済みなら「配置を見直してください」と確認を求める。
 *  - 完了済みのToDo（例: 旧日程でリマインド送信済み）: 自動で戻さず、「確認が必要」を表示。
 *    ユーザーが「やり直す（未着手に戻す）」か「このままでよい」を選ぶ。
 * 【キャンセル】
 *  - 未着手のToDo: 自動で「対象外」（理由: 予約キャンセル）。いつでも元に戻せる。
 *  - 予定に入れた／作業中のToDo: 自動で変えず「確認が必要」。
 *  - 完了済みのToDo・作成済みのレポート: 変更・削除しない。
 * 【削除】（カレンダー側で予定が消えた等、理由が不明）
 *  - 未完了のToDo: 自動で対象外にせず、すべて「確認が必要」。
 *  - 完了済み・レポート: 残す。
 * 【復元】
 *  - キャンセルで自動的に対象外になったToDoを未着手に戻す。
 */
export function applyBookingEvent(
  data: AppData,
  bookingId: string,
  event: "rescheduled" | "cancelled" | "deleted" | "restored",
  now: Date,
): AppData {
  const AUTO_CANCEL_REASON = "予約キャンセルのため自動で対象外";
  const todos = data.todos.map((t) => {
    if (t.bookingId !== bookingId) return t;
    switch (event) {
      case "rescheduled":
        if (isOpen(t) && t.block) {
          return { ...t, needsReview: "予約日時が変更されました。配置した作業時間を見直してください。" };
        }
        if (t.status === "done" && (t.kind === "remind" || t.kind === "review_prev" || t.kind === "thanks")) {
          return { ...t, needsReview: "完了後に予約日時が変更されました。やり直しが必要か確認してください。" };
        }
        return t;
      case "cancelled":
        if (t.status === "todo") return changeTodoStatus(t, "na", AUTO_CANCEL_REASON, now);
        if (t.status === "scheduled" || t.status === "doing") {
          return { ...t, needsReview: "予約がキャンセルされました。このToDoを続けるか確認してください。" };
        }
        return t;
      case "deleted":
        if (isOpen(t)) {
          return { ...t, needsReview: "予定が削除されました（理由不明）。対象外にするか確認してください。" };
        }
        return t;
      case "restored":
        if (t.status === "na" && t.statusReason === AUTO_CANCEL_REASON) {
          return { ...changeTodoStatus(t, "todo", "予約の復元により未着手に戻しました", now), needsReview: undefined };
        }
        return { ...t, needsReview: undefined };
    }
  });
  return { ...data, todos };
}

// ---------- 今日の画面用の分類 ----------

export interface TodayBuckets {
  needsReview: Todo[];
  overdue: Todo[];
  today: Todo[];
  later: { todo: Todo; from: Date }[];
  closedToday: Todo[];
}

export function bucketTodos(data: AppData, now: Date): TodayBuckets {
  const todayKey = dateKey(now);
  const endOfToday = new Date(startOfDay(todayKey).getTime() + DAY);
  const res: TodayBuckets = { needsReview: [], overdue: [], today: [], later: [], closedToday: [] };

  for (const t of data.todos) {
    if (t.needsReview) {
      res.needsReview.push(t);
      continue;
    }
    if (!isOpen(t)) {
      if (t.statusChangedAt && dateKeyOf(t.statusChangedAt) === todayKey) res.closedToday.push(t);
      continue;
    }
    if (t.seminarId && data.seminars.find((s) => s.id === t.seminarId)?.status === "delivered") continue; // 配信済みの回は表示しない
    const b = t.bookingId ? data.bookings.find((x) => x.id === t.bookingId) : undefined;
    if (t.bookingId && (!b || b.status !== "scheduled")) {
      // 予約が無効なのに未完了 → 確認が必要として扱う
      res.needsReview.push(t);
      continue;
    }
    const w = todoWindow(t, data);
    if (!w) continue;
    const placedToday = t.block && dateKeyOf(t.block.start) === todayKey;
    if (w.visibleFrom.getTime() <= now.getTime() || placedToday) {
      if (w.due && dateKey(new Date(w.due.getTime() - 1)) < todayKey) res.overdue.push(t);
      else res.today.push(t);
    } else if (w.visibleFrom.getTime() < endOfToday.getTime()) {
      res.later.push({ todo: t, from: w.visibleFrom });
    }
  }

  const dueOf = (t: Todo) => todoWindow(t, data)?.due?.getTime() ?? Infinity;
  res.overdue.sort((a, b) => dueOf(a) - dueOf(b));
  res.today.sort((a, b) => dueOf(a) - dueOf(b));
  res.later.sort((a, b) => a.from.getTime() - b.from.getTime());
  res.closedToday.sort((a, b) => (b.statusChangedAt ?? "").localeCompare(a.statusChangedAt ?? ""));
  return res;
}
