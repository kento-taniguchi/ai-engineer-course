import { useEffect, useState } from 'react';
import { Flag } from 'lucide-react';
import type { Todo } from '@/lib/supabase';
import { WEEKDAYS_MON, addDays, dayKey, formatTime, isSameDay, startOfMonth, startOfWeek } from '@/lib/date';
import { dueOn, isOverdue, layoutDayEvents } from '@/lib/tasks';
import type { CategoryColor } from '@/lib/colors';

const MAX_ITEMS = 3;

interface Props {
  cursor: Date;
  todos: Todo[];
  now: Date;
  pickedId: string | null;
  colorOf: (category: string) => CategoryColor;
  onDayClick: (day: Date) => void;
  /** 日付の数字を押したとき（日表示へ） */
  onDateClick: (day: Date) => void;
  onDropTodo: (id: string, day: Date) => void;
  onEventClick: (id: string) => void;
  onEventOpen: (id: string) => void;
}

export function MonthGrid({ cursor, todos, now, pickedId, colorOf, onDayClick, onDateClick, onDropTodo, onEventClick, onEventOpen }: Props) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const gridStart = startOfWeek(startOfMonth(cursor));
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  useEffect(() => {
    const clear = () => setDragKey(null);
    window.addEventListener('dragend', clear);
    return () => window.removeEventListener('dragend', clear);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-7 border-b border-navy-100">
        {WEEKDAYS_MON.map((w) => (
          <div key={w} className="py-2 text-center text-[11px] font-bold text-navy-400">
            {w}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {days.map((day) => {
          const key = dayKey(day);
          const inMonth = day.getMonth() === cursor.getMonth();
          const today = isSameDay(day, now);
          const scheduled = layoutDayEvents(todos, day).map((e) => e.todo);
          const dueOnly = dueOn(todos, day).filter((t) => !scheduled.some((s) => s.id === t.id));
          const entries = [
            ...scheduled.map((t) => ({ todo: t, kind: 'event' as const })),
            ...dueOnly.map((t) => ({ todo: t, kind: 'due' as const })),
          ];
          const hidden = entries.length - MAX_ITEMS;

          return (
            <div
              key={key}
              onClick={() => onDayClick(day)}
              title={pickedId ? 'この日に配置' : 'この日にタスクを追加'}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragKey !== key) setDragKey(key);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragKey(null);
                const id = e.dataTransfer.getData('text/plain');
                if (id) onDropTodo(id, day);
              }}
              className={`flex min-h-[84px] cursor-pointer flex-col gap-0.5 overflow-hidden border-b border-l border-navy-50 p-1 transition ${
                inMonth ? 'bg-white' : 'bg-canvas'
              } ${pickedId ? 'hover:bg-accent/10' : 'hover:bg-navy-50/60'} ${dragKey === key ? 'bg-accent/20' : ''}`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDateClick(day);
                }}
                title="この日を日表示で見る"
                aria-label={`${day.getMonth() + 1}月${day.getDate()}日を日表示で見る`}
                className={`mb-0.5 flex h-6 w-6 items-center justify-center self-start rounded-full text-xs font-bold transition hover:ring-2 hover:ring-navy-200 ${
                  today ? 'bg-accent text-navy-900' : inMonth ? 'text-navy' : 'text-slate-400'
                }`}
              >
                {day.getDate()}
              </button>
              {entries.slice(0, MAX_ITEMS).map(({ todo, kind }) => {
                const overdue = isOverdue(todo, now);
                const picked = pickedId === todo.id;
                return (
                  <button
                    key={`${kind}-${todo.id}`}
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation();
                      e.dataTransfer.setData('text/plain', todo.id);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(todo.id);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onEventOpen(todo.id);
                    }}
                    title={todo.category ? `${todo.title}（${todo.category}）` : todo.title}
                    className={`flex items-center gap-1 truncate rounded px-1 py-px text-left text-[11px] ${
                      overdue
                        ? 'bg-red-600 font-bold text-white'
                        : todo.completed
                          ? 'text-slate-500 line-through'
                          : kind === 'event'
                            ? 'text-white'
                            : 'border border-l-[3px] border-navy-100 text-navy'
                    } ${picked ? 'ring-2 ring-accent' : ''}`}
                    style={
                      overdue || todo.completed
                        ? undefined
                        : kind === 'event'
                          ? { backgroundColor: colorOf(todo.category).solid }
                          : { borderLeftColor: colorOf(todo.category).solid }
                    }
                  >
                    {kind === 'due' ? (
                      <Flag className="h-3 w-3 shrink-0" />
                    ) : (
                      <span className="shrink-0 tabular-nums opacity-80">{formatTime(new Date(todo.scheduled_at!))}</span>
                    )}
                    <span className="truncate">{todo.title}</span>
                  </button>
                );
              })}
              {hidden > 0 && <span className="px-1 text-[10px] text-navy-400">+{hidden}件</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
