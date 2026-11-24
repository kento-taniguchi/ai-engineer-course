import { CalendarClock, CalendarPlus, CheckCircle2, ChevronRight, Circle, CornerDownRight, Flag, Layers, Pencil, Trash2 } from 'lucide-react';
import type { Todo } from '@/lib/supabase';
import { formatDateTime } from '@/lib/date';
import { isOverdue, priorityMeta } from '@/lib/tasks';

interface Props {
  todo: Todo;
  now: Date;
  picked: boolean;
  /** サブタスクの場合、コアタスクの名前 */
  parentTitle?: string | null;
  /** コアタスクの場合：サブタスクの件数と、しまっている中に期限切れがあるか */
  subtasks?: { total: number; done: number; overdue: boolean };
  expanded?: boolean;
  onToggleExpand?: () => void;
  /** コアの下に並ぶサブタスクとして表示する */
  nested?: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onPick: () => void;
  onDelete: () => void;
}

export function TaskItem({
  todo,
  now,
  picked,
  parentTitle,
  subtasks,
  expanded = false,
  onToggleExpand,
  nested = false,
  onToggle,
  onEdit,
  onPick,
  onDelete,
}: Props) {
  const overdue = isOverdue(todo, now);
  const pr = priorityMeta(todo.priority);

  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', todo.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`group relative flex items-start gap-3 overflow-hidden rounded-xl border pl-4 pr-2 transition ${nested ? 'py-2' : 'py-3'} ${
        overdue
          ? 'border-red-300 bg-red-50'
          : todo.completed
            ? 'border-slate-100 bg-slate-50'
            : 'border-navy-100 bg-white hover:border-navy-200 hover:shadow-sm'
      } ${picked ? 'ring-2 ring-accent ring-offset-1' : ''}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${overdue ? 'bg-red-500' : todo.completed ? 'bg-slate-200' : pr.stripe}`} />

      <button
        onClick={onToggle}
        className="mt-0.5 shrink-0 transition hover:scale-110"
        aria-label={todo.completed ? '未完了にする' : '完了にする'}
      >
        {todo.completed ? (
          <CheckCircle2 className="h-5 w-5 text-navy" />
        ) : (
          <Circle className={`h-5 w-5 ${overdue ? 'text-red-400' : 'text-navy-200 hover:text-navy'}`} />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <button
          onClick={onEdit}
          className={`block w-full break-words text-left leading-snug ${nested ? 'text-sm' : 'text-[15px]'} ${
            todo.completed ? 'text-slate-400 line-through' : overdue ? 'font-bold text-red-700' : 'text-slate-800'
          }`}
        >
          {todo.title}
        </button>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className={`rounded px-1.5 py-0.5 font-bold ${todo.completed ? 'bg-slate-100 text-slate-400' : pr.badge}`}>
            {pr.label}
          </span>
          {todo.due_at && (
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${
                overdue ? 'bg-red-600 font-bold text-white' : 'bg-slate-100 text-slate-500'
              }`}
              aria-label={overdue ? '期限切れ' : '期限'}
            >
              <Flag className="h-3 w-3" />
              {formatDateTime(todo.due_at)}
            </span>
          )}
          {todo.scheduled_at && (
            <span className="inline-flex items-center gap-1 rounded bg-navy-50 px-1.5 py-0.5 text-navy">
              <CalendarClock className="h-3 w-3" />
              {formatDateTime(todo.scheduled_at)}
            </span>
          )}
          {nested ? null : parentTitle ? (
            <span className="inline-flex max-w-full items-center gap-1 truncate rounded border border-navy-100 px-1.5 py-0.5 text-navy-300" title={`コア：${parentTitle}`}>
              <CornerDownRight className="h-3 w-3 shrink-0" />
              <span className="truncate">{parentTitle}</span>
            </span>
          ) : (
            todo.set_name && (
              <span className="inline-flex items-center gap-1 rounded border border-navy-100 px-1.5 py-0.5 text-navy-300">
                <Layers className="h-3 w-3" />
                {todo.set_name}
              </span>
            )
          )}
        </div>
        {subtasks && subtasks.total > 0 && (
          <button
            onClick={onToggleExpand}
            aria-expanded={expanded}
            className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-bold text-navy hover:bg-navy-50"
          >
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            サブタスク {subtasks.done}/{subtasks.total}
            {subtasks.overdue && !expanded && <span className="h-2 w-2 rounded-full bg-red-600" aria-label="期限切れあり" />}
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 md:opacity-0 md:transition md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        <IconButton label="カレンダーに配置" onClick={onPick} active={picked}>
          <CalendarPlus className="h-4 w-4" />
        </IconButton>
        <IconButton label="編集" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </IconButton>
        <IconButton label="削除" onClick={onDelete} danger>
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>
    </li>
  );
}

function IconButton({
  label,
  onClick,
  children,
  danger = false,
  active = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`rounded-lg p-1.5 transition ${
        active
          ? 'bg-accent text-white'
          : danger
            ? 'text-slate-300 hover:bg-red-50 hover:text-red-500'
            : 'text-slate-400 hover:bg-navy-50 hover:text-navy'
      }`}
    >
      {children}
    </button>
  );
}
