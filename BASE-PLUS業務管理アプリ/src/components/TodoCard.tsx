"use client";

import Link from "next/link";
import { useState } from "react";
import type { AppData, Todo, TodoStatus } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { STATUS_LABEL, STATUS_ICON, TODO_ACTION_LABEL, isOpen, urgencyOf, type UrgencyInfo } from "@/lib/todoEngine";
import type { TodoLevel } from "@/lib/todayGroups";
import { bookingOf, targetHref, targetName, todoTitle } from "@/lib/selectors";
import { formatDateTime, formatRange, formatTime, dateKeyOf, formatDate } from "@/lib/time";
import { postponeTodo, resolveReview, setTodoStatus } from "@/lib/operations";
import { KindBadge, Modal, OffBadge, StatusChip, UrgencyBadge } from "./ui";
import { TaskDialog } from "./TaskDialog";
import { BulkCloseBookingTodosButton, GcalRegisterDialog } from "./GoogleParts";
import { useGoogle } from "@/store/GoogleStore";
import { TASK_CATEGORY_LABEL } from "@/lib/workTasks";
import { addDaysKey, dateKey } from "@/lib/time";

export function todoActionHref(data: AppData, t: Todo): string | null {
  const b = bookingOf(data, t);
  switch (t.kind) {
    case "review_prev":
      return b?.target ? `${targetHref(b.target)}?review=${encodeURIComponent(t.id)}` : null;
    case "remind":
    case "thanks":
    case "send_feedback":
      return `/message?todo=${encodeURIComponent(t.id)}`;
    case "create_feedback":
      return b ? `/report?booking=${encodeURIComponent(b.id)}` : null;
    case "lesson_plan":
      return b ? `/plan?booking=${encodeURIComponent(b.id)}` : null;
    case "seminar_make":
    case "seminar_reserve":
      return t.seminarId ? `/seminar/${t.seminarId}` : "/seminar";
    case "seminar_task":
      return t.seminarId ? `/seminar/${t.seminarId}` : "/seminar";
    case "sns_task":
      return t.reelId ? `/sns?reel=${encodeURIComponent(t.reelId)}#sns-schedule` : "/sns";
    default:
      return null;
  }
}

export function TodoCard({
  todo,
  onPlace,
  draggable = false,
  hideTarget = false,
  level,
}: {
  todo: Todo;
  onPlace?: (t: Todo) => void;
  draggable?: boolean;
  /** グループ表示のとき、対象者名を省略する */
  hideTarget?: boolean;
  /** グループ表示のとき、グループと同じルールの緊急性を使う */
  level?: TodoLevel;
}) {
  const { data, now, update } = useApp();
  const [statusOpen, setStatusOpen] = useState(false);
  const [postponeOpen, setPostponeOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const b = bookingOf(data, todo);
  const baseUrgency = urgencyOf(todo, data, now);
  const urgency: UrgencyInfo = level
    ? {
        level: level.level,
        label: [level.label, baseUrgency.label].filter((x, i, a) => x && a.indexOf(x) === i).join("・"),
      }
    : baseUrgency;
  const href = todoActionHref(data, todo);
  const open = isOpen(todo);
  const cls = [
    "todo",
    todo.needsReview ? "is-review" : urgency.level !== "normal" ? `is-${urgency.level}` : "",
    open ? "" : "is-closed",
  ].join(" ");

  return (
    <article
      className={cls}
      draggable={draggable && open}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/todo-id", todo.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      aria-label={todoTitle(data, todo)}
    >
      {draggable && open && (
        <span className="drag-handle" aria-hidden="true" title="ドラッグしてスケジュールに配置">
          ⋮⋮
        </span>
      )}
      <div className="todo-body">
        <div className="row">
          <StatusChip status={todo.status} />
          <UrgencyBadge info={urgency} />
          {todo.block && (
            <span className="badge badge-info">
              <span aria-hidden="true">◷</span>
              {formatTime(todo.block.start)}〜 {todo.block.durationMin}分
            </span>
          )}
        </div>
        <div className="todo-title" style={{ marginTop: 4 }}>
          {href && open ? (
            <Link href={href} className="todo-title-link">
              {todoTitle(data, todo)}
            </Link>
          ) : (
            todoTitle(data, todo)
          )}
        </div>
        {b && (
          <div className="todo-meta">
            {!hideTarget && (
              <>
                {b.target ? <Link href={targetHref(b.target)}>{targetName(data, b.target)}</Link> : targetName(data, b.target)}
                {" ・ "}
              </>
            )}
            指導 {formatRange(b.start, b.end)}{" "}
            <span className="hide-mobile">
              <KindBadge kind={b.kind} />
            </span>
            {b.status !== "scheduled" && (
              <span className="badge badge-danger" style={{ marginLeft: 4 }}>
                {b.status === "cancelled" ? "予約キャンセル" : "予定削除"}
              </span>
            )}
          </div>
        )}
        {!b && <WorkMeta todo={todo} />}
        <GcalState todo={todo} />
        {todo.needsReview && (
          <div className="notice notice-info" style={{ marginTop: 8 }} role="note">
            <strong>確認が必要：</strong>
            {todo.needsReview}
            <div className="todo-actions">
              {open ? (
                <>
                  <button className="btn btn-sm" onClick={() => update((d, n) => resolveReview(d, todo.id, "keep", n), "このまま続けます")}>
                    このまま続ける
                  </button>
                  <button className="btn btn-sm" onClick={() => update((d, n) => resolveReview(d, todo.id, "na", n), "対象外にしました")}>
                    対象外にする
                  </button>
                  {b && <BulkCloseBookingTodosButton bookingId={b.id} />}
                </>
              ) : (
                <>
                  <button className="btn btn-sm" onClick={() => update((d, n) => resolveReview(d, todo.id, "reopen", n), "未着手に戻しました")}>
                    やり直す（未着手に戻す）
                  </button>
                  <button className="btn btn-sm" onClick={() => update((d, n) => resolveReview(d, todo.id, "keep", n), "このままにしました")}>
                    このままでよい
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        {!open && (
          <div className="todo-meta">
            {STATUS_LABEL[todo.status]}にした日時：{todo.statusChangedAt ? formatDateTime(todo.statusChangedAt) : "-"}
            {todo.statusReason && <>／理由：{todo.statusReason}</>}
          </div>
        )}
        <div className="todo-actions">
          {href && (
            <Link href={href} className={`btn btn-sm ${open ? "btn-primary" : ""}`}>
              {TODO_ACTION_LABEL[todo.kind]} <span aria-hidden="true">→</span>
            </Link>
          )}
          {open && onPlace && (
            <button className="btn btn-sm" onClick={() => onPlace(todo)}>
              <span aria-hidden="true">◷</span> {todo.block ? "配置を変更" : "時間に配置"}
            </button>
          )}
          {todo.taskId && (
            <button className="btn btn-sm" onClick={() => setEditOpen(true)}>
              編集・削除
            </button>
          )}
          {open && (
            <button className="btn btn-sm btn-ghost" onClick={() => setPostponeOpen(true)}>
              後日に変更
            </button>
          )}
          <button className="btn btn-sm btn-ghost" onClick={() => setStatusOpen(true)}>
            状態を変更
          </button>
        </div>
      </div>
      {statusOpen && <StatusDialog todo={todo} onClose={() => setStatusOpen(false)} />}
      {postponeOpen && <PostponeDialog todo={todo} onClose={() => setPostponeOpen(false)} />}
      {editOpen && todo.taskId && <TaskDialog taskId={todo.taskId} occurrence={todo.occurrence} onClose={() => setEditOpen(false)} />}
    </article>
  );
}

const ALL: TodoStatus[] = ["todo", "scheduled", "doing", "done", "na"];

export function StatusDialog({ todo, onClose }: { todo: Todo; onClose: () => void }) {
  const { data, update } = useApp();
  const [status, setStatus] = useState<TodoStatus>(todo.status);
  const [reason, setReason] = useState(todo.statusReason);
  const needReason = status === "done" || status === "na";

  return (
    <Modal
      title="状態を変更"
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              update((d, n) => setTodoStatus(d, todo.id, status, reason.trim(), n), `「${STATUS_LABEL[status]}」に変更しました`);
              onClose();
            }}
          >
            変更する
          </button>
        </>
      }
    >
      <p className="small muted" style={{ marginBottom: 16 }}>
        {todoTitle(data, todo)}
      </p>
      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend className="sr-only">状態</legend>
        <div className="stack">
          {ALL.map((s) => (
            <label key={s} className="check">
              <input type="radio" name="status" value={s} checked={status === s} onChange={() => setStatus(s)} />
              <span aria-hidden="true">{STATUS_ICON[s]}</span> {STATUS_LABEL[s]}
            </label>
          ))}
        </div>
      </fieldset>
      {needReason && (
        <label className="field" style={{ marginTop: 16 }}>
          理由・メモ（任意）
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={status === "na" ? "例：今回は不要" : "例：LINEで送信"} />
        </label>
      )}
      {todo.history.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary className="small">変更履歴（{todo.history.length}件）</summary>
          <ul className="small muted">
            {todo.history
              .slice()
              .reverse()
              .map((h, i) => (
                <li key={i}>
                  {formatDate(dateKeyOf(h.at))} {formatTime(h.at)}：{STATUS_LABEL[h.from]} → {STATUS_LABEL[h.to]}
                  {h.reason && `（${h.reason}）`}
                </li>
              ))}
          </ul>
        </details>
      )}
    </Modal>
  );
}

/** 予約以外の仕事（SNS・プチセミナー・手動）の補足表示 */
function WorkMeta({ todo }: { todo: Todo }) {
  const { data } = useApp();
  const parts: string[] = [];
  if (todo.kind === "sns_task") {
    const sc = data.reels.find((r) => r.id === todo.reelId)?.taskSchedule?.[todo.snsKey!];
    if (sc?.workDate) parts.push(`対応日 ${formatDate(sc.workDate)}`);
    if (sc?.dueDate) parts.push(`期限 ${formatDate(sc.dueDate)}`);
  } else if (todo.kind === "seminar_task") {
    const ep = data.seminars.find((s) => s.id === todo.seminarId);
    if (ep) parts.push(`配信日 ${formatDate(ep.deliveryDate)}`);
  } else if (todo.taskId) {
    if (todo.category) parts.push(TASK_CATEGORY_LABEL[todo.category]);
    if (todo.workDate) parts.push(`対応日 ${formatDate(todo.workDate)}`);
    parts.push(todo.dueDate ? `期限 ${formatDate(todo.dueDate)}` : "期限なし");
    if (todo.durationMin) parts.push(`約${todo.durationMin}分`);
    const task = data.tasks.find((t) => t.id === todo.taskId);
    if (task && task.repeat.type !== "none") parts.push("繰り返し");
  }
  if (todo.postponedTo) parts.push(`${formatDate(todo.postponedTo)}に変更済み`);
  return (
    <>
      {parts.length > 0 && <div className="todo-meta">{parts.join(" ・ ")}</div>}
      {todo.memo && <div className="todo-meta pre">メモ：{todo.memo}</div>}
      {todo.kind === "seminar_task" && todo.seminarTaskKey === "line" && (
        <div className="xs" style={{ marginTop: 4 }}>
          <OffBadge>LINE未連携：完了にしても配信予約は完了しません</OffBadge>
        </div>
      )}
      {todo.kind === "sns_task" && todo.snsKey === "post" && (
        <div className="xs" style={{ marginTop: 4 }}>
          <OffBadge>Instagram未連携：完了にしても投稿済みにはなりません（投稿後にSNS画面で「投稿済みにする」）</OffBadge>
        </div>
      )}
    </>
  );
}

/** ToDoを後日に変更 */
function PostponeDialog({ todo, onClose }: { todo: Todo; onClose: () => void }) {
  const { data, now, update } = useApp();
  const [to, setTo] = useState(addDaysKey(dateKey(now), 1));
  return (
    <Modal
      title="後日に変更"
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button
            className="btn btn-primary"
            disabled={!to}
            onClick={() => {
              update((d, n) => postponeTodo(d, todo.id, to, n), `${formatDate(to)}に変更しました`);
              onClose();
            }}
          >
            変更する
          </button>
        </>
      }
    >
      <p className="small" style={{ marginBottom: 16 }}>
        <strong>{todoTitle(data, todo)}</strong>
      </p>
      <label className="field">
        この日から表示する
        <input type="date" value={to} min={dateKey(now)} onChange={(e) => setTo(e.target.value)} />
      </label>
      <p className="xs muted" style={{ marginTop: 8 }}>
        同じToDoのまま表示する日だけ変わります。状態の履歴や関連する情報はそのまま残ります。期限は変わらないため、期限より後にすると「期限超過」と表示されます。
      </p>
    </Modal>
  );
}

/** Googleカレンダーに登録した作業予定の状態（登録済み・時間のずれ・失敗） */
function GcalState({ todo }: { todo: Todo }) {
  const g = useGoogle();
  const [dialog, setDialog] = useState(false);
  const gc = todo.gcal;
  if (!gc || gc.status === "removed") return null;
  const differs = !!todo.block && (todo.block.start !== gc.start || todo.block.durationMin !== gc.durationMin);
  const unplaced = !todo.block;
  return (
    <div className="row xs" style={{ marginTop: 4, gap: 4 }}>
      {gc.status === "synced" && !differs && !unplaced && <span className="badge badge-ok">✓ Googleカレンダー登録済み（{formatTime(gc.start)}〜）</span>}
      {gc.status === "synced" && differs && <span className="badge badge-warning">! Googleカレンダーの予定（{formatTime(gc.start)}〜）と時間が異なります</span>}
      {gc.status === "synced" && unplaced && <span className="badge badge-warning">! 配置を解除しましたが、Googleカレンダーの予定は残っています</span>}
      {gc.status === "error" && <span className="badge badge-danger">⚠ Googleカレンダーに登録できませんでした：{gc.error}</span>}
      {(differs || gc.status === "error") && todo.block && (
        <button className="btn btn-sm" onClick={() => setDialog(true)} disabled={!!g.busy}>
          {gc.status === "error" ? "登録を再試行" : "カレンダーを更新"}
        </button>
      )}
      {gc.status === "synced" && (
        <button className="btn btn-sm btn-ghost" disabled={!!g.busy} onClick={() => confirm(`Googleカレンダーから「${gc.title}」を削除しますか？`) && g.removeTodoEvent(todo.id)}>
          Googleの予定を削除
        </button>
      )}
      {dialog && <GcalRegisterDialog todoId={todo.id} onClose={() => setDialog(false)} />}
    </div>
  );
}
