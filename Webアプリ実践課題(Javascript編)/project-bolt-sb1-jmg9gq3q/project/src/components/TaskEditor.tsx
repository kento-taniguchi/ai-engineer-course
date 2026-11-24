import { useState } from 'react';
import { BookmarkPlus, Trash2 } from 'lucide-react';
import type { Priority, Todo, TodoPatch } from '@/lib/supabase';
import { DURATION_OPTIONS, formatDuration, fromInputValue, toInputValue } from '@/lib/date';
import { Field, Modal, PriorityPicker, ghostButton, inputClass, primaryButton } from '@/components/ui';

interface Props {
  todo: Todo;
  onSave: (patch: TodoPatch) => void;
  onDelete: () => void;
  onSaveAsTemplate: () => void;
  onClose: () => void;
}

export function TaskEditor({ todo, onSave, onDelete, onSaveAsTemplate, onClose }: Props) {
  const [title, setTitle] = useState(todo.title);
  const [notes, setNotes] = useState(todo.notes ?? '');
  const [priority, setPriority] = useState<Priority>(todo.priority);
  const [due, setDue] = useState(toInputValue(todo.due_at));
  const [scheduled, setScheduled] = useState(toInputValue(todo.scheduled_at));
  const [duration, setDuration] = useState(todo.duration_minutes);
  const [completed, setCompleted] = useState(todo.completed);

  const durations = DURATION_OPTIONS.includes(duration) ? DURATION_OPTIONS : [...DURATION_OPTIONS, duration].sort((a, b) => a - b);

  const save = () => {
    const t = title.trim();
    if (!t) return;
    onSave({
      title: t,
      notes,
      priority,
      due_at: fromInputValue(due),
      scheduled_at: fromInputValue(scheduled),
      duration_minutes: duration,
      completed,
    });
  };

  return (
    <Modal
      title="タスクを編集"
      onClose={onClose}
      footer={
        <>
          <button onClick={onDelete} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500" aria-label="削除" title="削除">
            <Trash2 className="h-4 w-4" />
          </button>
          <button onClick={onSaveAsTemplate} className={`${ghostButton} px-2.5`} title="テンプレートに保存">
            <BookmarkPlus className="h-4 w-4" />
            <span className="hidden sm:inline">テンプレートに保存</span>
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className={ghostButton}>
            キャンセル
          </button>
          <button onClick={save} disabled={!title.trim()} className={primaryButton}>
            保存
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="タスク名">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputClass} autoFocus />
        </Field>

        <div className="flex flex-wrap items-end gap-4">
          <Field label="優先度">
            <PriorityPicker value={priority} onChange={setPriority} />
          </Field>
          <label className="flex items-center gap-2 pb-1 text-sm text-slate-600">
            <input type="checkbox" checked={completed} onChange={(e) => setCompleted(e.target.checked)} className="h-4 w-4 accent-[#1E3A8A]" />
            完了
          </label>
        </div>

        <Field label="期限">
          <div className="flex gap-2">
            <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className={inputClass} />
            {due && (
              <button type="button" onClick={() => setDue('')} className={`${ghostButton} shrink-0`}>
                なし
              </button>
            )}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <Field label="カレンダーの日時（いつ行うか）">
            <div className="flex gap-2">
              <input type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} className={inputClass} />
              {scheduled && (
                <button type="button" onClick={() => setScheduled('')} className={`${ghostButton} shrink-0`}>
                  外す
                </button>
              )}
            </div>
          </Field>
          <Field label="所要時間">
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={inputClass}>
              {durations.map((d) => (
                <option key={d} value={d}>
                  {formatDuration(d)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="メモ">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputClass} />
        </Field>

        {todo.set_name && <p className="text-xs text-slate-400">セット「{todo.set_name}」から登録</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
