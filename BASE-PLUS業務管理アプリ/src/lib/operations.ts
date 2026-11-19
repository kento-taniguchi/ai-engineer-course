// データを変更する操作。すべて「元のデータ → 新しいデータ」を返す関数として作っています。
// 画面からはこれらを呼ぶだけにしておくと、保存先を変えても画面側の修正が少なく済みます。

import type { AppData, Booking, DateKey, LessonPlan, ManualTask, Report, ScheduleDates, SnsTaskKey, TargetRef, TimeBlock, Todo, TodoStatus } from "./types";
import { dueForOccurrence, taskTodoId } from "./workTasks";
import { applyBookingEvent, bookingTodoId, changeTodoStatus, ensureTodos, isOpen } from "./todoEngine";
import { formatRange, toISO } from "./time";
import { targetName } from "./selectors";

function mapTodo(data: AppData, id: string, fn: (t: Todo) => Todo): AppData {
  return { ...data, todos: data.todos.map((t) => (t.id === id ? fn(t) : t)) };
}

function mapBooking(data: AppData, id: string, fn: (b: Booking) => Booking): AppData {
  return { ...data, bookings: data.bookings.map((b) => (b.id === id ? fn(b) : b)) };
}

// ---------- ToDo ----------

export function setTodoStatus(data: AppData, id: string, status: TodoStatus, reason: string, now: Date): AppData {
  return mapTodo(data, id, (t) => changeTodoStatus(t, status, reason, now));
}

export function setTodoBlock(data: AppData, id: string, block: TimeBlock | undefined, now: Date): AppData {
  return mapTodo(data, id, (t) => {
    const next: Todo = { ...t, block };
    if (block && t.status === "todo") return changeTodoStatus(next, "scheduled", "スケジュールに配置", now);
    if (!block && t.status === "scheduled") return changeTodoStatus(next, "todo", "配置を解除", now);
    return next;
  });
}

/** 「確認が必要」への対応 */
export function resolveReview(data: AppData, id: string, action: "keep" | "reopen" | "na", now: Date): AppData {
  return mapTodo(data, id, (t) => {
    if (action === "reopen") return { ...changeTodoStatus(t, "todo", "確認の結果、やり直し", now), needsReview: undefined };
    if (action === "na") return changeTodoStatus(t, "na", "確認の結果、対象外", now);
    return { ...t, needsReview: undefined };
  });
}

/** 予約に紐づく未完了のToDo */
export function openTodosOfBooking(data: AppData, bookingId: string): Todo[] {
  return data.todos.filter((t) => t.bookingId === bookingId && isOpen(t));
}

/**
 * 予約がキャンセル・削除されたとき、その予約の未完了ToDoをまとめて「対象外」にする（本人の操作）。
 * 完了済みのToDo・レポート・指導メモは変更しない。予約が有効な場合は何もしない（誤操作防止）。
 */
export function closeBookingTodos(data: AppData, bookingId: string, reason: string, now: Date): AppData {
  const b = data.bookings.find((x) => x.id === bookingId);
  if (!b || b.status === "scheduled") return data;
  return { ...data, todos: data.todos.map((t) => (t.bookingId === bookingId && isOpen(t) ? changeTodoStatus(t, "na", reason, now) : t)) };
}

export function saveDraft(data: AppData, id: string, draft: string): AppData {
  return mapTodo(data, id, (t) => ({ ...t, draft }));
}

export function markSent(data: AppData, id: string, now: Date): AppData {
  return setTodoStatus(data, id, "done", "送信済みにする（ユーザーが送信後に操作）", now);
}

// ---------- 予約 ----------

function pushHistory(b: Booking, type: Booking["history"][number]["type"], detail: string, now: Date): Booking {
  return { ...b, history: [...b.history, { at: toISO(now), type, detail }] };
}

export function addBooking(data: AppData, booking: Booking, now: Date): AppData {
  return ensureTodos({ ...data, bookings: [...data.bookings, booking] }, now);
}

export function rescheduleBooking(data: AppData, id: string, start: string, end: string, now: Date): AppData {
  const before = data.bookings.find((b) => b.id === id);
  if (!before) return data;
  let next = mapBooking(data, id, (b) =>
    pushHistory({ ...b, start, end }, "rescheduled", `${formatRange(b.start, b.end)} → ${formatRange(start, end)}`, now),
  );
  // 売上の計上月も追従
  next = {
    ...next,
    sales: next.sales.map((s) =>
      s.source.type === "booking" && s.source.bookingId === id ? { ...s, month: start.slice(0, 7) } : s,
    ),
  };
  return applyBookingEvent(next, id, "rescheduled", now);
}

export function cancelBooking(data: AppData, id: string, reason: string, now: Date): AppData {
  let next = mapBooking(data, id, (b) => pushHistory({ ...b, status: "cancelled" }, "cancelled", reason || "キャンセル", now));
  next = {
    ...next,
    sales: next.sales.map((s) =>
      s.source.type === "booking" && s.source.bookingId === id ? { ...s, status: "cancelled" } : s,
    ),
  };
  return applyBookingEvent(next, id, "cancelled", now);
}

/** 削除: 予約データは履歴として残し、状態を「削除」にする（レポート・完了記録は消さない） */
export function deleteBooking(data: AppData, id: string, now: Date): AppData {
  const next = mapBooking(data, id, (b) => pushHistory({ ...b, status: "deleted" }, "deleted", "予定を削除", now));
  return applyBookingEvent(next, id, "deleted", now);
}

export function restoreBooking(data: AppData, id: string, now: Date): AppData {
  let next = mapBooking(data, id, (b) => pushHistory({ ...b, status: "scheduled" }, "restored", "予定を元に戻しました", now));
  next = {
    ...next,
    sales: next.sales.map((s) =>
      s.source.type === "booking" && s.source.bookingId === id && s.status === "cancelled" ? { ...s, status: "planned" } : s,
    ),
  };
  return ensureTodos(applyBookingEvent(next, id, "restored", now), now);
}

export function setBookingTarget(data: AppData, id: string, target: TargetRef, now: Date): AppData {
  const next = mapBooking(data, id, (b) => pushHistory({ ...b, target }, "target-set", `対象者を「${targetName(data, target)}」に設定`, now));
  return ensureTodos(next, now);
}

export function setBookingPlan(data: AppData, id: string, plan: string): AppData {
  return mapBooking(data, id, (b) => ({ ...b, plan }));
}

// ---------- レポート ----------

export function upsertReport(data: AppData, report: Report, now: Date): AppData {
  const exists = data.reports.some((r) => r.id === report.id);
  const saved = { ...report, updatedAt: toISO(now) };
  let next: AppData = {
    ...data,
    reports: exists ? data.reports.map((r) => (r.id === report.id ? saved : r)) : [...data.reports, saved],
  };
  // 「フィードバックを作成」ToDoを完了に
  if (report.bookingId) {
    const tid = bookingTodoId(report.bookingId, "create_feedback");
    const t = next.todos.find((x) => x.id === tid);
    if (t && t.status !== "done") next = setTodoStatus(next, tid, "done", "レポートを保存", now);
  }
  return next;
}

// ---------- 今回の指導内容のメモ ----------

export function planIsEmpty(p: Pick<LessonPlan, "purpose" | "content" | "checks" | "tools" | "memo">): boolean {
  return ![p.purpose, p.content, p.checks, p.tools, p.memo].some((v) => v.trim());
}

/**
 * メモを保存し、「今回の指導内容をメモ」ToDoを完了にする。
 * ※ 前回記録の確認（review_prev）とは別扱い。こちらを保存しても前回記録の確認は完了にならない。
 */
export function upsertLessonPlan(data: AppData, plan: LessonPlan, now: Date): AppData {
  const b = data.bookings.find((x) => x.id === plan.bookingId);
  const exists = data.lessonPlans.some((p) => p.id === plan.id);
  const saved: LessonPlan = { ...plan, bookingStartAtSave: b?.start ?? plan.bookingStartAtSave, updatedAt: toISO(now) };
  let next: AppData = {
    ...data,
    lessonPlans: exists ? data.lessonPlans.map((p) => (p.id === plan.id ? saved : p)) : [...data.lessonPlans, saved],
  };
  const tid = bookingTodoId(plan.bookingId, "lesson_plan");
  const t = next.todos.find((x) => x.id === tid);
  if (t && t.status !== "done" && !planIsEmpty(plan)) next = setTodoStatus(next, tid, "done", "今回の指導内容のメモを保存", now);
  return next;
}

// ---------- 第4版：手動の仕事・後日に変更・SNSの予定 ----------

/** ToDoを後日に変更（同じToDoのまま表示日だけずらすので、履歴や関連情報は失われない） */
export function postponeTodo(data: AppData, id: string, to: DateKey, now: Date): AppData {
  return mapTodo(data, id, (t) => ({
    ...t,
    postponedTo: to,
    // 手動の仕事は対応日も変更（期限はそのまま）
    workDate: t.taskId ? to : t.workDate,
    block: t.block && t.block.start.slice(0, 10) < to ? undefined : t.block,
    history: [...t.history, { at: toISO(now), from: t.status, to: t.status, reason: `対応日を ${to} に変更` }],
  }));
}

export function addTask(data: AppData, task: ManualTask, now: Date): AppData {
  return ensureTodos({ ...data, tasks: [...(data.tasks ?? []), task] }, now);
}

export type TaskScope = "this" | "future";

export interface TaskEdit {
  title: string;
  category: ManualTask["category"];
  workDate: DateKey;
  dueDate?: DateKey;
  dueOffsetDays?: number;
  durationMin?: number;
  memo?: string;
  repeat: ManualTask["repeat"];
}

/**
 * 仕事の編集。
 * - 今回のみ（this）：この回のToDoだけ変更（仕事の設定は変えない）
 * - 今後の予定も含める（future）：仕事の設定を変更し、この回以降の未完了のToDoにも反映。完了済みの回は変更しない
 */
export function editTask(data: AppData, taskId: string, occurrence: DateKey, edit: TaskEdit, scope: TaskScope, now: Date): AppData {
  const task = data.tasks.find((t) => t.id === taskId);
  if (!task) return data;
  const todoId = taskTodoId(taskId, occurrence);
  const applyToTodo = (t: Todo, due: DateKey | undefined, workDate: DateKey): Todo => ({
    ...t,
    title: edit.title,
    category: edit.category,
    workDate,
    dueDate: due,
    durationMin: edit.durationMin,
    memo: edit.memo,
  });
  if (scope === "this" || task.repeat.type === "none") {
    let next = mapTodo(data, todoId, (t) => applyToTodo(t, edit.dueDate, edit.workDate));
    if (task.repeat.type === "none") {
      next = {
        ...next,
        tasks: next.tasks.map((x) =>
          x.id === taskId ? { ...x, title: edit.title, category: edit.category, dueDate: edit.dueDate, durationMin: edit.durationMin, memo: edit.memo } : x,
        ),
      };
      if (edit.repeat.type !== "none") {
        // 繰り返さない仕事を繰り返しに変更：この回を開始日として設定
        next = { ...next, tasks: next.tasks.map((x) => (x.id === taskId ? { ...x, repeat: edit.repeat, dueOffsetDays: edit.dueOffsetDays } : x)) };
      }
    }
    return ensureTodos(next, now);
  }
  // 今後の予定も含める
  let next: AppData = {
    ...data,
    tasks: data.tasks.map((x) =>
      x.id === taskId
        ? { ...x, title: edit.title, category: edit.category, dueOffsetDays: edit.dueOffsetDays, durationMin: edit.durationMin, memo: edit.memo, repeat: edit.repeat }
        : x,
    ),
  };
  const updated = next.tasks.find((x) => x.id === taskId)!;
  next = {
    ...next,
    todos: next.todos.map((t) => {
      if (t.taskId !== taskId || !t.occurrence || t.occurrence < occurrence || !isOpen(t)) return t;
      const workDate = t.occurrence === occurrence ? edit.workDate : t.workDate ?? t.occurrence;
      return applyToTodo(t, dueForOccurrence(updated, t.occurrence), workDate);
    }),
  };
  return ensureTodos(next, now);
}

/**
 * 仕事の削除。
 * - 今回のみ：この回を「作らない日」に登録し、この回のToDoを削除
 * - 今後の予定も含める：この回以降を作らないようにし、この回以降の未完了のToDoを削除。完了済みの履歴は残す
 * - 繰り返さない仕事：仕事とToDoを削除
 */
export function deleteTask(data: AppData, taskId: string, occurrence: DateKey, scope: TaskScope): AppData {
  const task = data.tasks.find((t) => t.id === taskId);
  if (!task) return data;
  if (task.repeat.type === "none") {
    return { ...data, tasks: data.tasks.filter((t) => t.id !== taskId), todos: data.todos.filter((t) => t.taskId !== taskId) };
  }
  if (scope === "this") {
    return {
      ...data,
      tasks: data.tasks.map((t) => (t.id === taskId ? { ...t, skipDates: [...(t.skipDates ?? []), occurrence] } : t)),
      todos: data.todos.filter((t) => t.id !== taskTodoId(taskId, occurrence)),
    };
  }
  return {
    ...data,
    tasks: data.tasks.map((t) => (t.id === taskId ? { ...t, until: occurrence } : t)),
    todos: data.todos.filter((t) => !(t.taskId === taskId && t.occurrence && t.occurrence >= occurrence && isOpen(t))),
  };
}

/** SNSの作業の対応日・期限を設定（空にするとToDoは表示されなくなるが、履歴は残る） */
export function setSnsSchedule(data: AppData, reelId: string, key: SnsTaskKey, dates: ScheduleDates, now: Date): AppData {
  const next = {
    ...data,
    reels: data.reels.map((r) =>
      r.id === reelId ? { ...r, taskSchedule: { ...(r.taskSchedule ?? {}), [key]: { workDate: dates.workDate || undefined, dueDate: dates.dueDate || undefined } } } : r,
    ),
  };
  return ensureTodos(next, now);
}

/** 本人がInstagramに投稿した後に「投稿済み」にする（ToDoの完了とは別に記録） */
export function setReelPosted(data: AppData, reelId: string, posted: boolean, now: Date): AppData {
  return {
    ...data,
    reels: data.reels.map((r) =>
      r.id === reelId ? { ...r, postedAt: posted ? toISO(now) : undefined, steps: r.steps.map((s, i) => (i === 7 ? { ...s, done: posted } : s)) } : r,
    ),
  };
}
