// 予約枠の計算（画面から分離）。将来ホームページやGoogleカレンダーと連携するときも、この判定を基準にします。

import type { AppData, Booking, DateKey, StandardSlot } from "./types";
import { combine, dateKeyOf, overlaps, weekdayOf } from "./time";

export type SlotState = "free" | "booked" | "closed" | "undecided";

export interface DaySlot {
  key: string;
  start: string;
  end: string;
  label: string;
  state: SlotState;
  bookings: Booking[];
  extra: boolean;
}

export interface DayPlan {
  date: DateKey;
  /** 曜日の営業有無（null=未設定） */
  weekdayOpen: boolean | null;
  closedAllDay: string | null;
  slots: DaySlot[];
  /** どの枠にも入らない予定 */
  outside: Booking[];
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function slotMinutes(s: { start: string; end: string }): number {
  return toMin(s.end) - toMin(s.start);
}

/** 通常枠の確認（長さ・次の枠までの間隔・重なり） */
export function checkStandardSlots(slots: StandardSlot[]): { id: string; length: number; gapToNext: number | null; problem: string | null }[] {
  const sorted = [...slots].sort((a, b) => a.start.localeCompare(b.start));
  return sorted.map((s, i) => {
    const length = slotMinutes(s);
    const next = sorted[i + 1];
    const gapToNext = next ? toMin(next.start) - toMin(s.end) : null;
    let problem: string | null = null;
    if (length <= 0) problem = "終了が開始より前です";
    else if (gapToNext !== null && gapToNext < 0) problem = "次の枠と時間が重なっています";
    return { id: s.id, length, gapToNext, problem };
  });
}

export function dayPlan(data: AppData, date: DateKey): DayPlan {
  const open = data.weekdayOpen?.[weekdayOf(date)] ?? null;
  const closedEx = data.slotExceptions.find((x) => x.date === date && x.type === "closed");
  const booked = data.bookings.filter((b) => b.status === "scheduled" && dateKeyOf(b.start) === date);
  const base: DaySlot[] = [...(data.standardSlots ?? [])]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((s) => {
      const inSlot = booked.filter((b) => overlaps(combine(date, s.start), combine(date, s.end), b.start, b.end));
      const slotClosed = data.slotExceptions.some((x) => x.date === date && x.type === "slot_closed" && x.slotId === s.id);
      let state: SlotState = "free";
      if (inSlot.length) state = "booked";
      else if (closedEx || slotClosed || open === false) state = "closed";
      else if (open === null) state = "undecided";
      return { key: s.id, start: s.start, end: s.end, label: `${s.start}〜${s.end}`, state, bookings: inSlot, extra: false };
    });
  const extras: DaySlot[] = data.slotExceptions
    .filter((x) => x.date === date && x.type === "extra" && x.start && x.end)
    .map((x) => {
      const inSlot = booked.filter((b) => overlaps(combine(date, x.start!), combine(date, x.end!), b.start, b.end));
      return { key: x.id, start: x.start!, end: x.end!, label: `${x.start}〜${x.end}（臨時）`, state: inSlot.length ? "booked" : closedEx ? "closed" : "free", bookings: inSlot, extra: true };
    });
  const all = [...base, ...extras].sort((a, b) => a.start.localeCompare(b.start));
  const outside = booked.filter((b) => !all.some((s) => s.bookings.includes(b)));
  return { date, weekdayOpen: open, closedAllDay: closedEx ? closedEx.memo || "休み" : null, slots: all, outside };
}
