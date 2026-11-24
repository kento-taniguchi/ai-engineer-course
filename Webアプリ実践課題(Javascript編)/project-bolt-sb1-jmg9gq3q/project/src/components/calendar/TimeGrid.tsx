import { useEffect, useRef, useState } from 'react';
import { Flag } from 'lucide-react';
import type { Todo } from '@/lib/supabase';
import { WEEKDAYS, dayKey, formatTime, isSameDay } from '@/lib/date';
import { dueOn, isOverdue, layoutDayEvents, priorityMeta } from '@/lib/tasks';

const HOUR_PX = 48;
const MIN_PX = HOUR_PX / 60;
const SLOTS = 48; // 30分刻み

interface Props {
  days: Date[];
  todos: Todo[];
  now: Date;
  pickedId: string | null;
  onSlot: (at: Date) => void;
  onDropTodo: (id: string, at: Date) => void;
  onEventClick: (id: string) => void;
  onEventOpen: (id: string) => void;
}

export function TimeGrid({ days, todos, now, pickedId, onSlot, onDropTodo, onEventClick, onEventOpen }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const cols = `52px repeat(${days.length}, minmax(0, 1fr))`;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_PX;
  }, []);

  useEffect(() => {
    const clear = () => setDragKey(null);
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
            <div key={dayKey(d)} className="border-l border-navy-50 py-2 text-center">
              <div className={`text-[11px] ${today ? 'font-bold text-accent' : 'text-slate-400'}`}>{WEEKDAYS[d.getDay()]}</div>
              <div
                className={`mx-auto mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold ${
                  today ? 'bg-accent text-white' : 'text-navy'
                }`}
              >
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* 期限の行 */}
      <div className="grid border-b border-navy-100 bg-canvas" style={{ gridTemplateColumns: cols }}>
        <div className="flex justify-end pr-2 pt-2 text-navy-300" title="期限">
          <Flag className="h-3.5 w-3.5" />
        </div>
        {days.map((d) => (
          <div key={dayKey(d)} className="min-h-[34px] space-y-1 border-l border-navy-50 p-1">
            {dueOn(todos, d).map((t) => {
              const overdue = isOverdue(t, now);
              return (
                <button
                  key={t.id}
                  onClick={() => onEventOpen(t.id)}
                  className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] ${
                    overdue ? 'bg-red-600 font-bold text-white' : 'border border-navy-100 bg-white text-navy'
                  }`}
                  title={t.title}
                >
                  {formatTime(new Date(t.due_at!))} {t.title}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* 時間の目盛り */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: cols }}>
          <div className="relative" style={{ height: 24 * HOUR_PX }}>
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <div key={h} className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-slate-400" style={{ top: h * HOUR_PX }}>
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
                      title={pickedId ? `${formatTime(at)} に配置` : undefined}
                      className={`${i % 2 === 0 ? 'border-t border-slate-200/80' : 'border-t border-dashed border-slate-100'} ${
                        pickedId ? 'cursor-pointer hover:bg-accent/10' : ''
                      } ${dragKey === key ? 'bg-accent/20' : ''}`}
                      style={{ height: HOUR_PX / 2 }}
                    />
                  );
                })}

                {today && (
                  <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: (now.getHours() * 60 + now.getMinutes()) * MIN_PX }}>
                    <div className="relative h-0.5 bg-accent">
                      <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-accent" />
                    </div>
                  </div>
                )}

                {events.map(({ todo, start, end, col, cols: n }) => {
                  const overdue = isOverdue(todo, now);
                  const picked = pickedId === todo.id;
                  const height = Math.max((end - start) * MIN_PX, 20);
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
                      title={`${todo.title}（クリックで移動・ダブルクリックで編集）`}
                      className={`absolute z-10 cursor-pointer overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-[11px] leading-tight shadow-sm transition ${
                        overdue
                          ? 'border-red-800 bg-red-600 text-white'
                          : todo.completed
                            ? 'border-slate-300 bg-slate-100 text-slate-400 line-through'
                            : `bg-navy text-white ${todo.priority === 1 ? 'border-accent' : todo.priority === 2 ? 'border-navy-300' : 'border-slate-300'}`
                      } ${picked ? 'opacity-60 ring-2 ring-accent ring-offset-1' : 'hover:brightness-110'}`}
                      style={{
                        top: start * MIN_PX + 1,
                        height: height - 2,
                        left: `calc(${(col / n) * 100}% + 2px)`,
                        width: `calc(${100 / n}% - 4px)`,
                      }}
                    >
                      <div className="truncate font-bold">{todo.title}</div>
                      {height >= 36 && (
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
