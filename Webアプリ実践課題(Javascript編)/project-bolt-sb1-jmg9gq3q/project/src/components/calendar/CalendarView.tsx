import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { EdgeZone } from '@/components/calendar/EdgeZone';
import type { Todo } from '@/lib/supabase';
import { WEEKDAYS, addDays, addMonths, startOfDay, startOfWeek } from '@/lib/date';
import { TimeGrid } from '@/components/calendar/TimeGrid';
import { HOUR_LEVELS } from '@/lib/calendar';
import { MonthGrid } from '@/components/calendar/MonthGrid';
import { CategoryLegend, NO_CATEGORY } from '@/components/calendar/CategoryLegend';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import type { CategoryColor } from '@/lib/colors';

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
  /** 何も選んでいないときにカレンダーを押すと、その日時でタスクを追加する */
  onCreateAt: (at: Date) => void;
  /** 旗の欄の空いているところを押したとき：その日が期限のToDoを追加する */
  onCreateDue: (day: Date) => void;
  /** 分類（事業）の一覧と色 */
  categories: string[];
  colorOf: (category: string) => CategoryColor;
  onSetColor: (name: string, colorKey: string) => void;
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
  const { mode, cursor, now, pickedId } = props;
  // 隠している分類の予定はカレンダーに出さない（移動のために選んでいるタスクは出す）
  const [hidden, setHidden] = useLocalStorage<string[]>('todo.hiddenCategories', []);
  // ドラッグ中かどうか（一覧からのドラッグも含む）。移動中だけ左右の帯を出す
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const on = () => setDragging(true);
    const off = () => setDragging(false);
    window.addEventListener('dragstart', on);
    window.addEventListener('dragend', off);
    window.addEventListener('drop', off);
    return () => {
      window.removeEventListener('dragstart', on);
      window.removeEventListener('dragend', off);
      window.removeEventListener('drop', off);
    };
  }, []);
  const moving = !!pickedId || dragging;

  // 時間の欄の縮尺（'fit' = 0時〜24時を1画面に収める）
  const [hourPx, setHourPx] = useLocalStorage<number | 'fit'>('todo.hourPx', 48);
  const zoom = (dir: 1 | -1) =>
    setHourPx((cur) => {
      if (cur === 'fit') return dir > 0 ? 48 : 28;
      const i = HOUR_LEVELS.findIndex((v) => v >= cur);
      const idx = Math.min(HOUR_LEVELS.length - 1, Math.max(0, (i === -1 ? HOUR_LEVELS.length - 1 : i) + dir));
      return HOUR_LEVELS[idx];
    });
  const zoomBtn = 'rounded-md p-1 text-navy-400 transition hover:bg-white hover:text-navy disabled:opacity-40';
  const unit = mode === 'month' ? '月' : mode === 'week' ? '週' : '日';

  const todos = props.todos.filter((t) => t.id === pickedId || !hidden.includes(t.category?.trim() || NO_CATEGORY));

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
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-navy-100 px-2 py-1.5 sm:px-3 sm:py-2">
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
        <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-navy sm:text-lg">{titleOf(mode, cursor)}</h2>
        {mode !== 'month' && (
          <div className="flex items-center gap-0.5 rounded-lg bg-navy-50 p-0.5" role="group" aria-label="時間の欄の大きさ">
            <button onClick={() => zoom(-1)} disabled={hourPx === HOUR_LEVELS[0]} className={zoomBtn} title="小さくする" aria-label="小さくする">
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              onClick={() => setHourPx(hourPx === 'fit' ? 48 : 'fit')}
              aria-pressed={hourPx === 'fit'}
              title="0時〜24時を1画面に表示"
              aria-label="0時〜24時を1画面に表示"
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold transition ${
                hourPx === 'fit' ? 'bg-navy text-white' : 'text-navy-400 hover:bg-white hover:text-navy'
              }`}
            >
              <Maximize2 className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">1日を表示</span>
            </button>
            <button
              onClick={() => zoom(1)}
              disabled={hourPx === HOUR_LEVELS[HOUR_LEVELS.length - 1]}
              className={zoomBtn}
              title="大きくする"
              aria-label="大きくする"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>
        )}
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
              className={`rounded-md px-3 py-1 text-sm font-bold transition sm:px-3.5 ${
                mode === value ? 'bg-navy text-white shadow-sm' : 'text-navy-400 hover:text-navy'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {(props.categories.length > 0 || hidden.length > 0) && (
        <CategoryLegend
          categories={props.categories}
          hidden={hidden}
          onToggle={(key) => setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]))}
          onShowAll={() => setHidden([])}
          colorOf={props.colorOf}
          onSetColor={props.onSetColor}
        />
      )}

      <div className="relative min-h-0 flex-1">
        {moving && (
          <>
            <EdgeZone side="left" label={`前の${unit}へ`} onStep={() => step(-1)} />
            <EdgeZone side="right" label={`次の${unit}へ`} onStep={() => step(1)} />
          </>
        )}
        {mode === 'month' ? (
          <MonthGrid
            cursor={cursor}
            todos={todos}
            now={now}
            pickedId={pickedId}
            colorOf={props.colorOf}
            onDayClick={(day) => {
              if (pickedId) placeOnDay(pickedId, day);
              else {
                const at = startOfDay(day);
                at.setHours(9, 0);
                props.onCreateAt(at);
              }
            }}
            onDateClick={(day) => {
              props.onCursorChange(day);
              props.onModeChange('day');
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
            hourPx={hourPx}
            onAddDue={props.onCreateDue}
            colorOf={props.colorOf}
            onSlot={(at) => (pickedId ? props.onPlace(pickedId, at) : props.onCreateAt(at))}
            onDropTodo={props.onPlace}
            onEventClick={props.onPick}
            onEventOpen={props.onOpen}
          />
        )}
      </div>
    </div>
  );
}
