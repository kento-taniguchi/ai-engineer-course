import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Todo } from '@/lib/supabase';
import { WEEKDAYS, addDays, addMonths, startOfDay, startOfWeek } from '@/lib/date';
import { TimeGrid } from '@/components/calendar/TimeGrid';
import { MonthGrid } from '@/components/calendar/MonthGrid';

export type CalendarMode = 'day' | 'week' | 'month';

interface Props {
  mode: CalendarMode;
  onModeChange: (m: CalendarMode) => void;
  cursor: Date;
  onCursorChange: (d: Date) => void;
  todos: Todo[];
  now: Date;
  pickedId: string | null;
  onPick: (id: string) => void;
  onOpen: (id: string) => void;
  onPlace: (id: string, at: Date) => void;
}

function titleOf(mode: CalendarMode, cursor: Date) {
  const y = cursor.getFullYear();
  const m = cursor.getMonth() + 1;
  if (mode === 'month') return `${y}年${m}月`;
  if (mode === 'day') return `${y}年${m}月${cursor.getDate()}日（${WEEKDAYS[cursor.getDay()]}）`;
  const s = startOfWeek(cursor);
  const e = addDays(s, 6);
  return `${s.getFullYear()}年${s.getMonth() + 1}月${s.getDate()}日 〜 ${e.getMonth() + 1}月${e.getDate()}日`;
}

export function CalendarView(props: Props) {
  const { mode, cursor, todos, now, pickedId } = props;

  const step = (dir: 1 | -1) => {
    if (mode === 'month') props.onCursorChange(addMonths(cursor, dir));
    else props.onCursorChange(addDays(cursor, mode === 'week' ? 7 * dir : dir));
  };

  /** 月表示：時刻はそのまま（未設定なら 9:00）で日付だけ移す */
  const placeOnDay = (id: string, day: Date) => {
    const todo = todos.find((t) => t.id === id);
    const at = startOfDay(day);
    if (todo?.scheduled_at) {
      const prev = new Date(todo.scheduled_at);
      at.setHours(prev.getHours(), prev.getMinutes());
    } else {
      at.setHours(9, 0);
    }
    props.onPlace(id, at);
  };

  const days = mode === 'day' ? [startOfDay(cursor)] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-navy-100 px-4 py-3">
        <div className="flex items-center gap-1">
          <button onClick={() => step(-1)} className="rounded-lg p-1.5 text-navy hover:bg-navy-50" aria-label="前へ">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button onClick={() => step(1)} className="rounded-lg p-1.5 text-navy hover:bg-navy-50" aria-label="次へ">
            <ChevronRight className="h-5 w-5" />
          </button>
          <button
            onClick={() => props.onCursorChange(new Date())}
            className="ml-1 rounded-lg border border-navy-100 px-2.5 py-1 text-xs font-bold text-navy hover:bg-navy-50"
          >
            今日
          </button>
        </div>
        <h2 className="flex-1 text-base font-bold text-navy sm:text-lg">{titleOf(mode, cursor)}</h2>
        <div className="flex rounded-lg bg-navy-50 p-0.5">
          {(
            [
              ['day', '日'],
              ['week', '週'],
              ['month', '月'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => props.onModeChange(value)}
              className={`rounded-md px-3.5 py-1 text-sm font-bold transition ${
                mode === value ? 'bg-navy text-white shadow-sm' : 'text-navy-300 hover:text-navy'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {mode === 'month' ? (
          <MonthGrid
            cursor={cursor}
            todos={todos}
            now={now}
            pickedId={pickedId}
            onDayClick={(day) => {
              if (pickedId) placeOnDay(pickedId, day);
              else {
                props.onCursorChange(day);
                props.onModeChange('day');
              }
            }}
            onDropTodo={placeOnDay}
            onEventClick={props.onPick}
            onEventOpen={props.onOpen}
          />
        ) : (
          <TimeGrid
            key={mode}
            days={days}
            todos={todos}
            now={now}
            pickedId={pickedId}
            onSlot={(at) => pickedId && props.onPlace(pickedId, at)}
            onDropTodo={props.onPlace}
            onEventClick={props.onPick}
            onEventOpen={props.onOpen}
          />
        )}
      </div>
    </div>
  );
}
