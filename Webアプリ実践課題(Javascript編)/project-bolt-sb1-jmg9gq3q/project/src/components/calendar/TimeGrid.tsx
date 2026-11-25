import { useCallback, useEffect, useRef, useState } from 'react';
import { Flag, GripHorizontal } from 'lucide-react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import type { CategoryColor } from '@/lib/colors';
import type { Todo } from '@/lib/supabase';
import { WEEKDAYS, dayKey, formatTime, isSameDay } from '@/lib/date';
import { dueOn, isOverdue, layoutDayEvents, priorityMeta } from '@/lib/tasks';

const SLOTS = 48; // 30分刻み
// 期限の欄の高さ（px）。これより多いと欄の中でスクロールする
const DUE_MIN = 0;
const DUE_MAX = 480;
const DUE_DEFAULT = 96;
const clampDue = (h: number) => Math.min(DUE_MAX, Math.max(DUE_MIN, Math.round(h)));

interface Props {
  days: Date[];
  todos: Todo[];
  now: Date;
  pickedId: string | null;
  /** 1時間あたりの高さ。'fit' なら 0時〜24時が1画面に収まる高さにする */
  hourPx: number | 'fit';
  /** 旗の欄の空いているところを押したとき：その日が期限のToDoを追加する */
  onAddDue: (day: Date) => void;
  colorOf: (category: string) => CategoryColor;
  onSlot: (at: Date) => void;
  onDropTodo: (id: string, at: Date) => void;
  onEventClick: (id: string) => void;
  onEventOpen: (id: string) => void;
}

export function TimeGrid({ days, todos, now, pickedId, hourPx, onAddDue, colorOf, onSlot, onDropTodo, onEventClick, onEventOpen }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dueBoxRef = useRef<HTMLDivElement>(null);

  // 「1日を表示」のときは、時間の欄の高さに 24時間分がちょうど収まるようにする
  const [fitPx, setFitPx] = useState(32);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setFitPx(Math.max(14, Math.floor((el.clientHeight / 24) * 100) / 100));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const HOUR_PX = hourPx === 'fit' ? fitPx : hourPx;
  const MIN_PX = HOUR_PX / 60;
  // 開いたときの位置：1日表示なら一番上、それ以外は朝7時あたり（最初の1回だけ使う）
  const initialScroll = useRef(hourPx === 'fit' ? 0 : 7 * HOUR_PX);
  // 縮尺を変えたら、見ていた時刻の位置を保つ
  const prevHour = useRef(HOUR_PX);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && prevHour.current !== HOUR_PX) el.scrollTop = (el.scrollTop / prevHour.current) * HOUR_PX;
    prevHour.current = HOUR_PX;
  }, [HOUR_PX]);
  // 移動中に上下の端へ近づけると、その方向へ自動でスクロールする（端に近いほど速い）
  const scrollSpeed = useRef(0);
  const scrollFrame = useRef<number | null>(null);
  const runScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || scrollSpeed.current === 0) {
      scrollFrame.current = null;
      return;
    }
    el.scrollTop += scrollSpeed.current;
    scrollFrame.current = requestAnimationFrame(runScroll);
  }, []);
  const edgeScroll = (clientY: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const zone = 56;
    let v = 0;
    if (clientY < r.top + zone) v = -Math.ceil(((r.top + zone - clientY) / zone) * 14);
    else if (clientY > r.bottom - zone) v = Math.ceil(((clientY - (r.bottom - zone)) / zone) * 14);
    scrollSpeed.current = v;
    if (v !== 0 && scrollFrame.current === null) scrollFrame.current = requestAnimationFrame(runScroll);
  };
  const stopScroll = () => {
    scrollSpeed.current = 0;
  };
  useEffect(
    () => () => {
      if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    },
    [],
  );
  const [dragKey, setDragKey] = useState<string | null>(null);
  const cols = `52px repeat(${days.length}, minmax(0, 1fr))`;
  const [dueHeight, setDueHeight] = useLocalStorage('todo.dueRowHeight', DUE_DEFAULT);
  const [lastOpenHeight, setLastOpenHeight] = useLocalStorage('todo.dueRowOpenHeight', DUE_DEFAULT);
  const [resizing, setResizing] = useState(false);
  // 旗の欄：その日が期限のもの。その日の時間の枠にすでに入っているものは出さない（二重に出さない）
  const dueOnly = (d: Date) => dueOn(todos, d).filter((t) => !(t.scheduled_at && isSameDay(new Date(t.scheduled_at), d)));
  const dueCount = days.reduce((n, d) => n + dueOnly(d).length, 0);

  /** 境目のバーをつかんで上下に動かすと、期限の欄の高さが変わる */
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    // 覚えている高さではなく、画面に見えている実際の高さから動かす（中身が少ないと見た目のほうが低い）
    const startH = dueBoxRef.current?.offsetHeight ?? dueHeight;
    setResizing(true);
    const move = (ev: PointerEvent) => setDueHeight(clampDue(startH + ev.clientY - startY));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setResizing(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /** ダブルクリック：1行に縮める ⇔ 元の高さに戻す */
  const toggleCollapse = () => {
    const shown = dueBoxRef.current?.offsetHeight ?? dueHeight;
    if (shown > DUE_MIN) {
      setLastOpenHeight(Math.max(shown, 40));
      setDueHeight(DUE_MIN);
    } else {
      setDueHeight(Math.max(lastOpenHeight, DUE_DEFAULT));
    }
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = initialScroll.current;
  }, []);

  useEffect(() => {
    const clear = () => {
      setDragKey(null);
      scrollSpeed.current = 0;
    };
    window.addEventListener('dragend', clear);
    return () => window.removeEventListener('dragend', clear);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 曜日の見出し */}
      <div className="grid border-b border-navy-100" style={{ gridTemplateColumns: cols }}>
        <div />
        {days.map((d) => {
          const today = isSameDay(d, now);
          return (
            <div key={dayKey(d)} className="flex items-center justify-center gap-1 border-l border-navy-50 py-1">
              <span
                className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm font-bold tabular-nums ${
                  today ? 'bg-accent text-navy-900' : 'text-navy'
                }`}
              >
                {d.getDate()}
              </span>
              <span className={`text-xs ${today ? 'font-bold text-navy' : d.getDay() === 0 ? 'text-red-600' : d.getDay() === 6 ? 'text-sky-700' : 'text-slate-500'}`}>
                {WEEKDAYS[d.getDay()]}
              </span>
            </div>
          );
        })}
      </div>

      {/* 期限の行（高さを変えられる。入りきらない分は欄の中でスクロール） */}
      <div ref={dueBoxRef} className="overflow-y-auto overscroll-contain bg-canvas" style={{ maxHeight: dueHeight }}>
        <div className="grid" style={{ gridTemplateColumns: cols }}>
          <div className="sticky top-0 flex justify-end pr-2 pt-2 text-navy-400" title="期限">
            <Flag className="h-3.5 w-3.5" />
          </div>
          {days.map((d) => (
            <div
              key={dayKey(d)}
              onClick={(e) => e.target === e.currentTarget && onAddDue(d)}
              title="空いているところを押すと、この日が期限のToDoを追加"
              className="min-h-[30px] cursor-cell space-y-1 border-l border-navy-50 p-1 transition-colors hover:bg-white"
            >
              {dueOnly(d).map((t) => {
                const overdue = isOverdue(t, now);
                const picked = pickedId === t.id;
                return (
                  <button
                    key={t.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', t.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onClick={() => onEventClick(t.id)}
                    onDoubleClick={() => onEventOpen(t.id)}
                    className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] ${
                      overdue ? 'bg-red-600 font-bold text-white' : 'border border-l-[3px] border-navy-100 bg-white text-navy hover:bg-navy-50'
                    } ${picked ? 'ring-2 ring-accent ring-offset-1' : ''}`}
                    style={overdue ? undefined : { borderLeftColor: colorOf(t.category).solid }}
                    title={`${t.title}${t.category ? `［${t.category}］` : ''}（クリックで選んで時間の枠へ移動・ダブルクリックで編集）`}
                  >
                    {formatTime(new Date(t.due_at!))} {t.title}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="期限の欄の高さ（上下の矢印キーでも変えられます）"
        aria-valuemin={DUE_MIN}
        aria-valuemax={DUE_MAX}
        aria-valuenow={dueHeight}
        tabIndex={0}
        onPointerDown={startResize}
        onDoubleClick={toggleCollapse}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const shown = dueBoxRef.current?.offsetHeight ?? dueHeight;
            setDueHeight(clampDue(shown + (e.key === 'ArrowDown' ? 24 : -24)));
          } else if (e.key === 'Enter') toggleCollapse();
        }}
        title="ドラッグで高さを変更・ダブルクリックで縮める／戻す"
        className={`group flex h-4 shrink-0 cursor-row-resize touch-none select-none items-center justify-center border-y border-navy-100 transition-colors ${
          resizing ? 'bg-navy-100' : 'bg-white hover:bg-navy-50'
        }`}
      >
        <GripHorizontal className={`h-3 w-3 ${resizing ? 'text-navy' : 'text-navy-200 group-hover:text-navy-400'}`} aria-hidden />
        {dueHeight < 28 && dueCount > 0 && (
          <span className="ml-1 text-[10px] font-bold leading-none text-navy-400">期限 {dueCount}件</span>
        )}
      </div>

      {/* 時間の目盛り */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto"
        onMouseMove={(e) => (pickedId ? edgeScroll(e.clientY) : stopScroll())}
        onMouseLeave={stopScroll}
        onDragOver={(e) => edgeScroll(e.clientY)}
        onDrop={stopScroll}
      >
        <div className="grid" style={{ gridTemplateColumns: cols }}>
          <div className="relative" style={{ height: 24 * HOUR_PX }}>
            {Array.from({ length: 23 }, (_, i) => i + 1)
              .filter((h) => HOUR_PX >= 18 || h % 2 === 0)
              .map((h) => (
              <div
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-slate-500"
                style={{ top: h * HOUR_PX }}
              >
                {h}:00
              </div>
            ))}
          </div>

          {days.map((day) => {
            const events = layoutDayEvents(todos, day);
            const today = isSameDay(day, now);
            return (
              <div key={dayKey(day)} className="relative border-l border-navy-50" style={{ height: 24 * HOUR_PX }}>
                {Array.from({ length: SLOTS }, (_, i) => {
                  const at = new Date(day);
                  at.setHours(Math.floor(i / 2), (i % 2) * 30, 0, 0);
                  const key = `${dayKey(day)}-${i}`;
                  return (
                    <div
                      key={i}
                      onClick={() => onSlot(at)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dragKey !== key) setDragKey(key);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragKey(null);
                        const id = e.dataTransfer.getData('text/plain');
                        if (id) onDropTodo(id, at);
                      }}
                      title={pickedId ? `${formatTime(at)} に配置` : `${formatTime(at)} にタスクを追加`}
                      className={`${i % 2 === 0 ? 'border-t border-slate-200/80' : 'border-t border-dashed border-slate-100'} ${
                        pickedId ? 'cursor-pointer hover:bg-accent/10' : 'cursor-cell hover:bg-navy-50'
                      } ${dragKey === key ? 'bg-accent/20' : ''}`}
                      style={{ height: HOUR_PX / 2 }}
                    />
                  );
                })}

                {today && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-20"
                    style={{
                      top: (now.getHours() * 60 + now.getMinutes()) * MIN_PX,
                    }}
                  >
                    <div className="relative h-0.5 bg-accent">
                      <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-accent" />
                    </div>
                  </div>
                )}

                {events.map(({ todo, start, end, col, cols: n }) => {
                  const overdue = isOverdue(todo, now);
                  const picked = pickedId === todo.id;
                  const height = Math.max((end - start) * MIN_PX, Math.min(20, HOUR_PX / 2));
                  return (
                    <div
                      key={todo.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', todo.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(todo.id);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onEventOpen(todo.id);
                      }}
                      title={`${todo.title}${todo.category ? `［${todo.category}］` : ''}（クリックで移動・ダブルクリックで編集）`}
                      className={`absolute z-10 cursor-pointer overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-[11px] leading-tight tabular-nums transition ${
                        overdue
                          ? 'border-red-800 bg-red-600 text-white'
                          : todo.completed
                            ? 'border-slate-300 bg-slate-100 text-slate-500 line-through'
                            : `text-white ${todo.priority === 1 ? 'border-accent' : 'border-white/40'}`
                      } ${picked ? 'opacity-60 ring-2 ring-accent ring-offset-1' : 'hover:brightness-110'}`}
                      style={{
                        backgroundColor: overdue || todo.completed ? undefined : colorOf(todo.category).solid,
                        top: start * MIN_PX + 1,
                        height: height - 2,
                        left: `calc(${(col / n) * 100}% + 2px)`,
                        width: `calc(${100 / n}% - 4px)`,
                      }}
                    >
                      <div className="truncate font-bold">{todo.title}</div>
                      {height >= 34 && (
                        <div className="truncate opacity-80">
                          {formatTime(new Date(todo.scheduled_at!))}〜 ・ {priorityMeta(todo.priority).label}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
