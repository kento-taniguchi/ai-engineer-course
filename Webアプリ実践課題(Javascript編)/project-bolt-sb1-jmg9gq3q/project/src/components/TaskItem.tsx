import { AlertCircle, CalendarClock, CalendarPlus, CheckCircle2, ChevronRight, Circle, CornerDownRight, Flag, Layers, Pencil, Repeat, Trash2 } from 'lucide-react';
import type { Todo } from '@/lib/supabase';
import { formatDateTime, formatTime, isSameDay } from '@/lib/date';
import { isOverdue, priorityMeta } from '@/lib/tasks';
import type { CategoryColor } from '@/lib/colors';
import { yen } from '@/lib/sales';

interface Props {
  todo: Todo;
  now: Date;
  picked: boolean;
  /** 分類の色（分類があるときだけ） */
  categoryColor?: CategoryColor | null;
  /** サブタスクの場合、コアタスクの名前 */
  parentTitle?: string | null;
  /** コアタスクの場合：サブタスクの件数と、しまっている中に期限切れがあるか */
  subtasks?: { total: number; done: number; overdue: boolean };
  expanded?: boolean;
  onToggleExpand?: () => void;
  /** コアの下に並ぶサブタスクとして表示する */
  nested?: boolean;
  /** 1行で小さく表示する */
  compact?: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onPick: () => void;
  onDelete: () => void;
}

export function TaskItem({
  todo,
  now,
  picked,
  categoryColor,
  parentTitle,
  subtasks,
  expanded = false,
  onToggleExpand,
  nested = false,
  compact = false,
  onToggle,
  onEdit,
  onPick,
  onDelete,
}: Props) {
  const overdue = isOverdue(todo, now);
  const pr = priorityMeta(todo.priority);

  const dragProps = {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData('text/plain', todo.id);
      e.dataTransfer.effectAllowed = 'move';
    },
  };
  const tone = overdue
    ? 'border-red-300 bg-red-50'
    : todo.completed
      ? 'border-slate-100 bg-slate-50'
      : 'border-navy-100 bg-white hover:border-navy-200';
  const stripe = overdue ? 'bg-red-500' : todo.completed ? 'bg-slate-200' : pr.stripe;
  const actions = (
    <>
      <IconButton label="カレンダーに配置" onClick={onPick} active={picked}>
        <CalendarPlus className="h-4 w-4" />
      </IconButton>
      <IconButton label="編集" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </IconButton>
      <IconButton label="削除" onClick={onDelete} danger>
        <Trash2 className="h-4 w-4" />
      </IconButton>
    </>
  );

  if (compact) {
    // いつ：カレンダーの日時があればそれ、なければ期限
    const whenIso = todo.scheduled_at ?? todo.due_at;
    const isDue = !todo.scheduled_at && !!todo.due_at;
    return (
      <li
        {...dragProps}
        className={`group relative flex items-center gap-1.5 overflow-hidden rounded-lg border py-1 pl-2.5 pr-1 transition ${tone} ${
          picked ? 'ring-2 ring-accent ring-offset-1' : ''
        }`}
      >
        <span className={`absolute inset-y-0 left-0 w-1 ${stripe}`} title={`優先度：${pr.label}`} />
        <button
          onClick={onToggle}
          className="shrink-0 rounded-full transition hover:scale-110"
          aria-label={todo.completed ? '未完了にする' : '完了にする'}
        >
          {todo.completed ? (
            <CheckCircle2 className="h-4 w-4 text-navy" />
          ) : (
            <Circle className={`h-4 w-4 ${overdue ? 'text-red-400' : 'text-navy-200 hover:text-navy'}`} />
          )}
        </button>
        {todo.category && categoryColor && (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: categoryColor.solid }}
            title={`分類：${todo.category}`}
            aria-label={`分類：${todo.category}`}
          />
        )}
        <button
          onClick={onEdit}
          title={todo.title}
          className={`min-w-0 flex-1 truncate text-left text-[13px] leading-6 ${
            todo.completed ? 'text-slate-500 line-through' : overdue ? 'font-bold text-red-700' : 'text-slate-800'
          }`}
        >
          {todo.title}
        </button>
        {todo.recurrence_id && <Repeat className="h-3 w-3 shrink-0 text-navy-400" aria-label="定期タスク" />}
        {!!todo.price && (
          <span className={`shrink-0 text-[11px] font-bold tabular-nums ${todo.completed ? 'text-slate-400' : 'text-emerald-700'}`} title="単価">
            {yen(todo.price)}
          </span>
        )}
        {subtasks && subtasks.total > 0 && (
          <button
            onClick={onToggleExpand}
            aria-expanded={expanded}
            aria-label={`サブタスク ${subtasks.done}/${subtasks.total}`}
            className="inline-flex shrink-0 items-center gap-0.5 rounded px-1 text-[11px] font-bold tabular-nums text-navy hover:bg-navy-50"
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            {subtasks.done}/{subtasks.total}
            {subtasks.overdue && !expanded && <span className="h-1.5 w-1.5 rounded-full bg-red-600" aria-label="期限切れあり" />}
          </button>
        )}
        {whenIso && (
          <span
            className={`inline-flex shrink-0 items-center gap-0.5 rounded px-1 text-[11px] tabular-nums ${
              overdue ? 'bg-red-600 font-bold text-white' : isDue ? 'text-slate-500' : 'text-navy'
            }`}
            title={isDue ? `期限 ${formatDateTime(whenIso)}` : `実施 ${formatDateTime(whenIso)}`}
          >
            {isDue ? <Flag className="h-3 w-3" aria-hidden /> : <CalendarClock className="h-3 w-3" aria-hidden />}
            {shortWhen(whenIso, now)}
          </span>
        )}
        <div className="flex shrink-0 items-center md:absolute md:inset-y-0 md:right-0 md:hidden md:bg-white/95 md:pl-1 md:pr-0.5 md:group-focus-within:flex md:group-hover:flex">
          {actions}
        </div>
      </li>
    );
  }

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
            : 'border-navy-100 bg-white hover:border-navy-200'
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
            todo.completed ? 'text-slate-500 line-through' : overdue ? 'font-bold text-red-700' : 'text-slate-800'
          }`}
        >
          {todo.title}
        </button>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs tabular-nums">
          {todo.category && categoryColor && (
            <span
              className="inline-flex max-w-[10rem] items-center gap-1 rounded px-1.5 py-0.5 text-slate-700"
              style={{ backgroundColor: todo.completed ? '#F1F5F9' : categoryColor.soft }}
              title={`分類：${todo.category}`}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: categoryColor.solid }} aria-hidden />
              <span className="truncate">{todo.category}</span>
            </span>
          )}
          <span className={`rounded px-1.5 py-0.5 font-bold ${todo.completed ? 'bg-slate-100 text-slate-500' : pr.badge}`}>
            {pr.label}
          </span>
          {!!todo.price && (
            <span className={`rounded px-1.5 py-0.5 font-bold ${todo.completed ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`} title="単価">
              {yen(todo.price)}
            </span>
          )}
          {todo.due_at && (
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${
                overdue ? 'bg-red-600 font-bold text-white' : 'bg-slate-100 text-slate-500'
              }`}
              aria-label={overdue ? '期限切れ' : '期限'}
            >
              {overdue ? <AlertCircle className="h-3 w-3" aria-hidden /> : <Flag className="h-3 w-3" aria-hidden />}
              {formatDateTime(todo.due_at)}
            </span>
          )}
          {todo.scheduled_at && (
            <span className="inline-flex items-center gap-1 rounded bg-navy-50 px-1.5 py-0.5 text-navy">
              <CalendarClock className="h-3 w-3" />
              {formatDateTime(todo.scheduled_at)}
            </span>
          )}
          {todo.recurrence_id && (
            <span className="inline-flex items-center gap-1 rounded border border-navy-100 px-1.5 py-0.5 text-navy-400" title="定期タスク">
              <Repeat className="h-3 w-3" aria-hidden />
              定期
            </span>
          )}
          {nested ? null : parentTitle ? (
            <span className="inline-flex max-w-full items-center gap-1 truncate rounded border border-navy-100 px-1.5 py-0.5 text-navy-400" title={`コア：${parentTitle}`}>
              <CornerDownRight className="h-3 w-3 shrink-0" />
              <span className="truncate">{parentTitle}</span>
            </span>
          ) : (
            todo.set_name && (
              <span className="inline-flex items-center gap-1 rounded border border-navy-100 px-1.5 py-0.5 text-navy-400">
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
            className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-bold text-navy transition hover:bg-navy-50"
          >
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            サブタスク {subtasks.done}/{subtasks.total}
            {subtasks.overdue && !expanded && <span className="h-2 w-2 rounded-full bg-red-600" aria-label="期限切れあり" />}
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 md:opacity-0 md:transition md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        {actions}
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
          ? 'bg-accent text-navy-900'
          : danger
            ? 'text-slate-500 hover:bg-red-50 hover:text-red-500'
            : 'text-slate-500 hover:bg-navy-50 hover:text-navy'
      }`}
    >
      {children}
    </button>
  );
}

/** 1行表示用の短い日時：今日なら時刻だけ、それ以外は「11/30 18:00」（終日の期限は日付だけ） */
function shortWhen(iso: string, now: Date) {
  const d = new Date(iso);
  const endOfDay = d.getHours() === 23 && d.getMinutes() === 59;
  if (isSameDay(d, now)) return endOfDay ? '今日' : formatTime(d);
  const date = `${d.getMonth() + 1}/${d.getDate()}`;
  return endOfDay ? date : `${date} ${formatTime(d)}`;
}
