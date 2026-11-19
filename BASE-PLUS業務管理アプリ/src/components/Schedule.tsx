"use client";

// 今日のスケジュール（タイムライン）と、ToDoを時間帯に配置する操作。
// パソコン: ToDoをドラッグして時間帯へドロップ / iPhone: 「時間に配置」から開始時刻と所要時間を選択。
// ※アプリ内の予定にのみ反映（Googleカレンダーには未連携）

import { useMemo, useState } from "react";
import type { AppData, Booking, DateKey, GCalEvent, TimeBlock, Todo } from "@/lib/types";
import { linkedBooking } from "@/lib/gcalSync";
import { useGoogle } from "@/store/GoogleStore";
import { GcalRegisterDialog } from "./GoogleParts";
import { useApp } from "@/store/AppStore";
import { DEFAULT_DURATION } from "@/lib/todoEngine";
import { bookingOf, targetName, todoTitle } from "@/lib/selectors";
import { addMinutes, combine, dateKeyOf, formatTime, hhmmOf, jstParts, overlaps, startOfDay } from "@/lib/time";
import { setTodoBlock } from "@/lib/operations";
import { Modal, OffBadge } from "./ui";

const HOUR_PX = 48;

interface Item {
  id: string;
  type: "booking" | "block" | "gcal";
  label: string;
  start: string;
  end: string;
  todo?: Todo;
  booking?: Booking;
}

/** その日の終日予定（Googleカレンダー） */
export function allDayEvents(data: AppData, day: DateKey): GCalEvent[] {
  return (data.google?.events ?? []).filter((e) => e.allDay && e.status !== "cancelled" && (e.startDate ?? "") <= day && day < (e.endDate ?? ""));
}

export function dayItems(data: AppData, day: DateKey): Item[] {
  const items: Item[] = [];
  for (const b of data.bookings) {
    if (b.status !== "scheduled" || dateKeyOf(b.start) !== day) continue;
    items.push({ id: b.id, type: "booking", label: `${targetName(data, b.target)}`, start: b.start, end: b.end, booking: b });
  }
  // Googleカレンダーの予定（予約に紐づけた予定・アプリから登録した作業予定は、それぞれの表示があるので除く）
  for (const e of data.google?.events ?? []) {
    if (e.allDay || e.status === "cancelled" || e.appTodoId || dateKeyOf(e.start) !== day) continue;
    const linked = linkedBooking(data, e);
    if (linked && linked.status === "scheduled") continue;
    items.push({ id: `g:${e.calendarId}:${e.eventId}`, type: "gcal", label: e.title, start: e.start, end: e.end });
  }
  for (const t of data.todos) {
    if (!t.block || dateKeyOf(t.block.start) !== day) continue;
    if (t.status === "done" || t.status === "na") continue;
    items.push({
      id: t.id,
      type: "block",
      label: todoTitle(data, t),
      start: t.block.start,
      end: addMinutes(t.block.start, t.block.durationMin),
      todo: t,
    });
  }
  return items.sort((a, b) => a.start.localeCompare(b.start));
}

/** 指定した時間帯と重なる予定 */
export function findConflicts(items: Item[], start: string, end: string, excludeId?: string): Item[] {
  return items.filter((i) => i.id !== excludeId && overlaps(start, end, i.start, i.end));
}

export function ScheduleTimeline({ day, onPlace }: { day: DateKey; onPlace: (t: Todo, start?: string) => void }) {
  const { data, now, update } = useApp();
  const items = useMemo(() => dayItems(data, day), [data, day]);
  const [overHour, setOverHour] = useState<number | null>(null);

  const startHour = Math.min(7, ...items.map((i) => jstParts(new Date(i.start)).hour));
  const endHour = Math.max(23, ...items.map((i) => jstParts(new Date(i.end)).hour + 1));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const dayStart = startOfDay(day).getTime() + startHour * 3600000;
  const top = (iso: string) => ((new Date(iso).getTime() - dayStart) / 60000) * (HOUR_PX / 60);

  const conflicts = items
    .filter((i) => i.type === "block")
    .map((i) => ({ item: i, with: findConflicts(items, i.start, i.end, i.id) }))
    .filter((c) => c.with.length > 0);
  const conflictIds = new Set(conflicts.map((c) => c.item.id));

  const drop = (e: React.DragEvent, hour: number) => {
    e.preventDefault();
    setOverHour(null);
    const id = e.dataTransfer.getData("text/todo-id");
    const t = data.todos.find((x) => x.id === id);
    if (!t) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const min = Math.floor(((e.clientY - rect.top) / rect.height) * 4) * 15;
    const start = combine(day, `${String(hour).padStart(2, "0")}:${String(Math.min(45, Math.max(0, min))).padStart(2, "0")}`);
    const block: TimeBlock = { start, durationMin: t.block?.durationMin ?? t.durationMin ?? DEFAULT_DURATION[t.kind] };
    update((d, n) => setTodoBlock(d, t.id, block, n), `${formatTime(start)}に配置しました（アプリ内のみ）`);
  };

  const nowTop = dateKeyOf(now.toISOString()) === day ? top(now.toISOString()) : null;

  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <ScheduleSourceNote />
      </div>
      <div className="legend" style={{ marginBottom: 8 }}>
        <span>
          <i style={{ background: "var(--navy)" }} />
          指導予定（左）
        </span>
        <span>
          <i style={{ background: "#eef0f3", border: "1px solid #9aa3b2" }} />
          Googleカレンダーの予定（左）
        </span>
        <span>
          <i style={{ background: "var(--gold-soft)", border: "1px dashed var(--gold)" }} />
          配置した作業（右）
        </span>
        <span>
          <i style={{ background: "#fff2f0", border: "1px solid var(--danger)" }} />⚠ 時間が重複
        </span>
      </div>
      {allDayEvents(data, day).length > 0 && (
        <div className="row xs" style={{ gap: 4, marginBottom: 8 }} aria-label="終日の予定">
          {allDayEvents(data, day).map((e) => (
            <span key={e.calendarId + e.eventId} className="badge badge-off">
              終日：{e.title}
            </span>
          ))}
        </div>
      )}
      <div className="timeline" role="region" aria-label="今日のスケジュール">
        {hours.map((h) => (
          <div
            key={h}
            className={`tl-hour ${overHour === h ? "is-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOverHour(h);
            }}
            onDragLeave={() => setOverHour((v) => (v === h ? null : v))}
            onDrop={(e) => drop(e, h)}
          >
            <div className="tl-label">{h}:00</div>
            <div className="tl-slot" />
          </div>
        ))}
        <div className="tl-items">
          {items.map((i) => {
            const t = top(i.start);
            const height = Math.max(22, top(i.end) - t);
            const isBlock = i.type === "block";
            const conflict = conflictIds.has(i.id);
            return (
              <button
                key={i.id}
                type="button"
                className={`tl-item ${isBlock ? "tl-block" : i.type === "gcal" ? "tl-gcal" : "tl-booking"} ${conflict ? "is-conflict" : ""}`}
                style={{ top: t, height, left: isBlock ? "50%" : 0, width: "50%" }}
                draggable={isBlock}
                onDragStart={(e) => i.todo && e.dataTransfer.setData("text/todo-id", i.todo.id)}
                onClick={() => i.todo && onPlace(i.todo)}
                title={`${formatTime(i.start)}〜${formatTime(i.end)} ${i.label}`}
                tabIndex={isBlock ? 0 : -1}
                aria-label={`${formatTime(i.start)}から${formatTime(i.end)} ${i.label}${conflict ? "（時間が重複）" : ""}`}
              >
                <strong>
                  {conflict && "⚠ "}
                  {formatTime(i.start)}
                </strong>{" "}
                {i.label}
                {i.booking && <span> ・指導</span>}
                {i.type === "gcal" && <span> ・Google</span>}
                {i.todo?.gcal?.status === "synced" && <span> ・G登録済</span>}
              </button>
            );
          })}
        </div>
        {nowTop !== null && nowTop >= 0 && <div className="tl-now" style={{ top: nowTop }} aria-hidden="true" />}
      </div>
      {conflicts.length > 0 && (
        <div className="notice notice-warn" style={{ marginTop: 8 }} role="status">
          <strong>⚠ 時間が重なっています</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
            {conflicts.map((c) => (
              <li key={c.item.id}>
                {formatTime(c.item.start)} {c.item.label} ↔ {c.with.map((w) => `${formatTime(w.start)} ${w.label}`).join("、")}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const DURATIONS = [5, 10, 15, 30, 45, 60, 90, 120];

function timeOptions(): string[] {
  const res: string[] = [];
  for (let h = 6; h <= 23; h++) for (const m of [0, 15, 30, 45]) res.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  return res;
}

export function PlaceDialog({ todo, day, onClose }: { todo: Todo; day: DateKey; onClose: () => void }) {
  const { data, now, update } = useApp();
  const google = useGoogle();
  const writeCal = data.google?.calendars.find((c) => c.id === data.google?.writeCalendarId);
  const canOfferGoogle = !!writeCal && google.status !== "unconfigured" && !!data.google?.connectedOnce;
  const [toGoogle, setToGoogle] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [askUnplace, setAskUnplace] = useState(false);
  const [unplaceError, setUnplaceError] = useState<string | null>(null);
  const options = timeOptions();
  const defaultStart = (() => {
    if (todo.block) return hhmmOf(todo.block.start);
    const p = jstParts(now);
    const m = Math.ceil((p.hour * 60 + p.minute) / 15) * 15;
    const hh = Math.min(23, Math.max(6, Math.floor(m / 60)));
    return `${String(hh).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  })();
  const [start, setStart] = useState(options.includes(defaultStart) ? defaultStart : "09:00");
  const [dur, setDur] = useState(todo.block?.durationMin ?? todo.durationMin ?? DEFAULT_DURATION[todo.kind]);
  const startISO = combine(day, start);
  const endISO = addMinutes(startISO, dur);
  const conflicts = findConflicts(dayItems(data, day), startISO, endISO, todo.id);
  const b = bookingOf(data, todo);

  const unplace = (message: string) => {
    update((d, n) => setTodoBlock(d, todo.id, undefined, n), message);
    onClose();
  };

  if (confirming) return <GcalRegisterDialog todoId={todo.id} onClose={onClose} />;

  // Googleカレンダーに登録済みの作業の配置を解除するとき：Google側の予定をどうするか確認する
  if (askUnplace && todo.gcal?.status === "synced") {
    const gc = todo.gcal;
    return (
      <Modal
        title="Googleカレンダーの予定も削除しますか？"
        onClose={() => setAskUnplace(false)}
        actions={
          <>
            <button className="btn" onClick={() => setAskUnplace(false)} disabled={!!google.busy}>
              やめる
            </button>
            <button className="btn" onClick={() => unplace("配置を解除しました（Googleカレンダーの予定は残しています）")} disabled={!!google.busy}>
              アプリ内だけ解除
            </button>
            <button
              className="btn btn-danger"
              disabled={!!google.busy}
              onClick={async () => {
                setUnplaceError(null);
                if (await google.removeTodoEvent(todo.id)) unplace("配置を解除し、Googleカレンダーの予定も削除しました");
                else setUnplaceError("Googleカレンダーの予定を削除できなかったため、配置はそのままにしています。");
              }}
            >
              {google.busy ?? "Googleの予定も削除して解除"}
            </button>
          </>
        }
      >
        <p className="small">
          この作業は Googleカレンダーに <strong>「{gc.title}」</strong>（{formatTime(gc.start)}〜）として登録されています。
        </p>
        <ul className="small" style={{ margin: "8px 0 0 20px" }}>
          <li>「Googleの予定も削除して解除」：アプリの配置とGoogleカレンダーの予定の両方を消します。</li>
          <li>「アプリ内だけ解除」：Googleカレンダーの予定は残ります（あとでカードの「Googleの予定を削除」で消せます）。</li>
        </ul>
        {unplaceError && (
          <p className="notice notice-danger small" role="alert" style={{ marginTop: 12 }}>
            ⚠ {unplaceError}
          </p>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      title="時間に配置"
      onClose={onClose}
      actions={
        <>
          {todo.block && (
            <button
              className="btn btn-danger"
              onClick={() => {
                if (todo.gcal?.status === "synced") setAskUnplace(true);
                else unplace("配置を解除しました");
              }}
            >
              配置を解除
            </button>
          )}
          <button className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              update((d, n) => setTodoBlock(d, todo.id, { start: startISO, durationMin: dur }, n), toGoogle ? `${start}〜に配置しました` : `${start}〜に配置しました（アプリ内のみ）`);
              if (toGoogle) setConfirming(true);
              else onClose();
            }}
          >
            配置する
          </button>
        </>
      }
    >
      <p style={{ marginBottom: 16 }}>
        <strong>{todoTitle(data, todo)}</strong>
        {b && <span className="small muted">（{targetName(data, b.target)}）</span>}
        {!b && todo.durationMin && <span className="small muted">（所要時間の目安 {todo.durationMin}分）</span>}
      </p>
      <div className="grid-2" style={{ gap: 16 }}>
        <label className="field">
          開始時刻
          <select value={start} onChange={(e) => setStart(e.target.value)}>
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          所要時間
          <select value={dur} onChange={(e) => setDur(Number(e.target.value))}>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d}分
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="small" style={{ marginTop: 16 }}>
        {start}〜{formatTime(endISO)}
      </p>
      {conflicts.length > 0 ? (
        <div className="notice notice-warn" style={{ marginTop: 8 }} role="status">
          ⚠ 既存の予定と重なっています：{conflicts.map((c) => `${formatTime(c.start)} ${c.label}`).join("、")}
        </div>
      ) : (
        <p className="xs muted" style={{ marginTop: 8 }}>
          重なる予定はありません
        </p>
      )}
      {canOfferGoogle ? (
        <label className="check" style={{ marginTop: 16 }}>
          <input type="checkbox" checked={toGoogle} onChange={(e) => setToGoogle(e.target.checked)} />
          Googleカレンダー（{writeCal!.summary}）にも登録する（次の画面で確認してから登録）
        </label>
      ) : (
        <p className="xs muted" style={{ marginTop: 16 }}>
          ※ アプリ内の予定にのみ反映されます。Googleカレンダーへの登録は「Google連携」画面で接続と登録先の設定をすると使えます。
        </p>
      )}
      {todo.gcal?.status === "synced" && <p className="xs" style={{ marginTop: 8 }}><span className="badge badge-ok">✓ Googleカレンダー登録済み</span> 時間を変えた場合は、カードの「カレンダーを更新」で反映できます。</p>}
    </Modal>
  );
}

/** スケジュールの出どころ（Googleカレンダーの接続状況）を正直に表示 */
function ScheduleSourceNote() {
  const { data } = useApp();
  const google = useGoogle();
  const last = data.google?.lastSync;
  if (google.status === "connected")
    return (
      <>
        <span className="badge badge-ok">✓ Googleカレンダー接続中</span>
        <span className="xs muted">配置した作業はアプリ内の予定です。登録した作業には「G登録済」と表示します</span>
      </>
    );
  if (google.status === "expired")
    return (
      <>
        <span className="badge badge-warning">! Googleカレンダー再接続が必要</span>
        <span className="xs muted">{last ? `前回の読み込み結果を表示中（${last.at.slice(5, 16).replace("T", " ")}）` : ""}</span>
      </>
    );
  return (
    <>
      <OffBadge>アプリ内の予定（Googleカレンダー未接続）</OffBadge>
      <span className="xs muted">配置した作業はGoogleカレンダーには登録されません</span>
    </>
  );
}
