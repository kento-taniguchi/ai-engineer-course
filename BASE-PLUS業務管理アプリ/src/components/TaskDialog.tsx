"use client";

// 手動の仕事（臨時・繰り返し）の追加・編集・削除

import { useState } from "react";
import type { ManualTask, Repeat, TaskCategory } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { newId } from "@/lib/selectors";
import { addTask, deleteTask, editTask, type TaskScope } from "@/lib/operations";
import { dateKey, formatDate, toISO, weekdayLabel, weekdayOf } from "@/lib/time";
import { TASK_CATEGORY_LABEL, repeatLabel, taskTodoId } from "@/lib/workTasks";
import { Modal } from "./ui";

const DURATIONS = [5, 10, 15, 30, 45, 60, 90, 120];
const WD_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function TaskDialog({
  taskId,
  occurrence,
  defaultCategory = "other",
  onClose,
}: {
  /** 編集する仕事（なければ新規追加） */
  taskId?: string;
  occurrence?: string;
  defaultCategory?: TaskCategory;
  onClose: () => void;
}) {
  const { data, now, update } = useApp();
  const today = dateKey(now);
  const task = taskId ? data.tasks.find((t) => t.id === taskId) : undefined;
  const occ = occurrence ?? task?.date ?? today;
  const todo = task ? data.todos.find((t) => t.id === taskTodoId(task.id, occ)) : undefined;
  const repeating = !!task && task.repeat.type !== "none";

  const [title, setTitle] = useState(todo?.title ?? task?.title ?? "");
  const [category, setCategory] = useState<TaskCategory>(todo?.category ?? task?.category ?? defaultCategory);
  const [workDate, setWorkDate] = useState(todo?.workDate ?? occ);
  const [dueDate, setDueDate] = useState(todo?.dueDate ?? task?.dueDate ?? "");
  const [dueOffset, setDueOffset] = useState<string>(task?.dueOffsetDays === undefined ? "" : String(task.dueOffsetDays));
  const [duration, setDuration] = useState<string>(String(todo?.durationMin ?? task?.durationMin ?? ""));
  const [memo, setMemo] = useState(todo?.memo ?? task?.memo ?? "");
  const [repeatType, setRepeatType] = useState<Repeat["type"]>(task?.repeat.type ?? "none");
  const [weekdays, setWeekdays] = useState<number[]>(task?.repeat.type === "weekly" ? task.repeat.weekdays : [weekdayOf(occ)]);
  const [monthDay, setMonthDay] = useState<number>(task?.repeat.type === "monthly" ? task.repeat.day : Number(occ.slice(8)));
  const [scope, setScope] = useState<TaskScope>("this");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const repeat: Repeat = repeatType === "weekly" ? { type: "weekly", weekdays } : repeatType === "monthly" ? { type: "monthly", day: monthDay } : { type: "none" };
  const isRepeat = repeat.type !== "none";
  const valid = !!title.trim() && !!workDate && (repeat.type !== "weekly" || weekdays.length > 0) && (!dueDate || isRepeat || dueDate >= workDate);
  const lockRepeat = repeating && scope === "this";

  const save = () => {
    const durationMin = duration ? Number(duration) : undefined;
    if (!task) {
      const t: ManualTask = {
        id: newId("task"),
        title: title.trim(),
        category,
        date: workDate,
        dueDate: !isRepeat && dueDate ? dueDate : undefined,
        dueOffsetDays: isRepeat && dueOffset !== "" ? Number(dueOffset) : undefined,
        durationMin,
        memo: memo.trim() || undefined,
        repeat,
        createdAt: toISO(new Date()),
      };
      update((d, n) => addTask(d, t, n), isRepeat ? `「${t.title}」を追加しました（${repeatLabel(repeat)}）` : `「${t.title}」を追加しました`);
    } else {
      update(
        (d, n) =>
          editTask(
            d,
            task.id,
            occ,
            {
              title: title.trim(),
              category,
              workDate,
              dueDate: lockRepeat || !isRepeat ? dueDate || undefined : undefined,
              dueOffsetDays: dueOffset !== "" ? Number(dueOffset) : undefined,
              durationMin,
              memo: memo.trim() || undefined,
              repeat: lockRepeat ? task.repeat : repeat,
            },
            scope,
            n,
          ),
        repeating ? (scope === "this" ? "この回だけ変更しました" : "今後の予定も含めて変更しました") : "変更しました",
      );
    }
    onClose();
  };

  if (confirmDelete && task) {
    const doneCount = data.todos.filter((t) => t.taskId === task.id && t.status === "done").length;
    return (
      <Modal
        title="仕事を削除しますか？"
        onClose={() => setConfirmDelete(false)}
        actions={
          <>
            <button className="btn" onClick={() => setConfirmDelete(false)}>
              やめる
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                update((d) => deleteTask(d, task.id, occ, scope), "削除しました");
                onClose();
              }}
            >
              削除する
            </button>
          </>
        }
      >
        <div className="card stack" style={{ marginBottom: 16 }}>
          <strong>{task.title}</strong>
          <span className="small">
            {TASK_CATEGORY_LABEL[task.category]} ・ {repeating ? repeatLabel(task.repeat) : `対応日 ${formatDate(task.date)}`}
          </span>
          {repeating && <span className="small">選んだ回：{formatDate(occ)}</span>}
        </div>
        <p className="small">
          {!repeating
            ? "この仕事を削除します。"
            : scope === "this"
              ? `${formatDate(occ)} の回だけを削除します。ほかの回はそのまま表示されます。`
              : `${formatDate(occ)} 以降の回を作らないようにし、この日以降の未完了の回を削除します。`}
        </p>
        {repeating && doneCount > 0 && <p className="xs muted" style={{ marginTop: 8 }}>完了済みの回（{doneCount}件）の履歴は削除しません。</p>}
      </Modal>
    );
  }

  return (
    <Modal
      title={task ? "仕事を編集" : "仕事を追加"}
      onClose={onClose}
      actions={
        <>
          {task && (
            <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              削除…
            </button>
          )}
          <button className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn btn-primary" disabled={!valid} onClick={save}>
            {task ? "保存する" : "追加する"}
          </button>
        </>
      }
    >
      <div className="stack-2">
        {repeating && (
          <fieldset className="card stack" style={{ margin: 0 }}>
            <legend className="small" style={{ fontWeight: 700, color: "var(--navy)" }}>
              変更・削除の範囲（{repeatLabel(task!.repeat)}）
            </legend>
            <label className="check">
              <input type="radio" name="scope" checked={scope === "this"} onChange={() => setScope("this")} />
              今回のみ（{formatDate(occ)} の回）
            </label>
            <label className="check">
              <input type="radio" name="scope" checked={scope === "future"} onChange={() => setScope("future")} />
              今後の予定も含める（{formatDate(occ)} 以降）
            </label>
            <span className="xs muted">過去の完了履歴は変更・削除しません。</span>
          </fieldset>
        )}
        <label className="field">
          仕事の名前（必須）
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：チーム監督に日程を確認" />
        </label>
        <label className="field">
          分類
          <select value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)}>
            {(Object.keys(TASK_CATEGORY_LABEL) as TaskCategory[]).map((c) => (
              <option key={c} value={c}>
                {TASK_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <div className="grid-2" style={{ gap: 16 }}>
          <label className="field">
            {isRepeat && !task ? "開始する日" : "対応する日"}
            <input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
          </label>
          {isRepeat && !lockRepeat ? (
            <label className="field">
              期限（任意）
              <select value={dueOffset} onChange={(e) => setDueOffset(e.target.value)}>
                <option value="">なし</option>
                <option value="0">対応日の当日</option>
                {[1, 2, 3, 5, 7].map((n) => (
                  <option key={n} value={n}>
                    対応日の{n}日後
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="field">
              期限（任意）
              <input type="date" value={dueDate} min={workDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
          )}
          <label className="field">
            所要時間（任意）
            <select value={duration} onChange={(e) => setDuration(e.target.value)}>
              <option value="">指定なし</option>
              {DURATIONS.map((m) => (
                <option key={m} value={m}>
                  {m}分
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            繰り返し
            <select value={repeatType} disabled={lockRepeat} onChange={(e) => setRepeatType(e.target.value as Repeat["type"])}>
              <option value="none">繰り返さない</option>
              <option value="weekly">毎週</option>
              <option value="monthly">毎月</option>
            </select>
          </label>
        </div>
        {lockRepeat && <p className="xs muted">繰り返しの設定を変えるときは「今後の予定も含める」を選んでください。</p>}
        {repeatType === "weekly" && !lockRepeat && (
          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend className="small" style={{ fontWeight: 700, color: "var(--navy)", marginBottom: 4 }}>
              曜日
            </legend>
            <div className="chip-group">
              {WD_ORDER.map((w) => (
                <button
                  key={w}
                  type="button"
                  className="chip"
                  aria-pressed={weekdays.includes(w)}
                  onClick={() => setWeekdays((x) => (x.includes(w) ? x.filter((y) => y !== w) : [...x, w]))}
                >
                  {weekdayLabel(w)}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {repeatType === "monthly" && !lockRepeat && (
          <label className="field">
            日付
            <select value={monthDay} onChange={(e) => setMonthDay(Number(e.target.value))}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  毎月{d}日{d >= 29 ? "（ない月は月末）" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          メモ（任意）
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} style={{ minHeight: 64 }} />
        </label>
        {isRepeat && !lockRepeat && <p className="xs muted">繰り返しの仕事は、該当する日に「今日やること」へ自動で表示されます。各回の完了は別々に記録します。</p>}
      </div>
    </Modal>
  );
}
