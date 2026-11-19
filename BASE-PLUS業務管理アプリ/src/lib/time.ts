// 日本時間（JST, UTC+9）で日時を扱うためのユーティリティ。
// 日本には夏時間がないため、UTCに9時間足して計算する方式で安全に扱えます。

import type { DateKey, ISODateTime } from "./types";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Date → JSTの各要素 */
export function jstParts(d: Date) {
  const j = new Date(d.getTime() + JST_OFFSET_MS);
  return {
    year: j.getUTCFullYear(),
    month: j.getUTCMonth() + 1,
    day: j.getUTCDate(),
    hour: j.getUTCHours(),
    minute: j.getUTCMinutes(),
    weekday: j.getUTCDay(),
  };
}

/** JSTの年月日時分 → Date */
export function fromJst(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - JST_OFFSET_MS);
}

/** Date → "+09:00" 付きISO文字列 */
export function toISO(d: Date): ISODateTime {
  const p = jstParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:00+09:00`;
}

export function dateKey(d: Date): DateKey {
  const p = jstParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function dateKeyOf(iso: ISODateTime): DateKey {
  return dateKey(new Date(iso));
}

export function parseDateKey(key: DateKey): { year: number; month: number; day: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { year: y, month: m, day: d };
}

/** その日のJST 0:00 */
export function startOfDay(key: DateKey): Date {
  const { year, month, day } = parseDateKey(key);
  return fromJst(year, month, day);
}

export function addDaysKey(key: DateKey, days: number): DateKey {
  const { year, month, day } = parseDateKey(key);
  return dateKey(fromJst(year, month, day + days, 12));
}

/** 日付キー同士の差（日数） a - b */
export function diffDays(a: DateKey, b: DateKey): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY);
}

export function weekdayOf(key: DateKey): number {
  return jstParts(startOfDay(key)).weekday;
}

export function weekdayLabel(n: number): string {
  return WEEKDAYS[n];
}

/** 例: 11月18日(水) */
export function formatDate(key: DateKey): string {
  const { month, day } = parseDateKey(key);
  return `${month}月${day}日(${WEEKDAYS[weekdayOf(key)]})`;
}

/** 例: 2026年11月18日(水) */
export function formatDateLong(key: DateKey): string {
  const { year } = parseDateKey(key);
  return `${year}年${formatDate(key)}`;
}

/** 例: 17:00 */
export function formatTime(iso: ISODateTime | Date): string {
  const p = jstParts(typeof iso === "string" ? new Date(iso) : iso);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** 例: 11月18日(水) 17:00 */
export function formatDateTime(iso: ISODateTime): string {
  return `${formatDate(dateKeyOf(iso))} ${formatTime(iso)}`;
}

/** 例: 11月18日(水) 17:00〜18:00 */
export function formatRange(start: ISODateTime, end: ISODateTime): string {
  const sameDay = dateKeyOf(start) === dateKeyOf(end);
  return sameDay
    ? `${formatDateTime(start)}〜${formatTime(end)}`
    : `${formatDateTime(start)}〜${formatDateTime(end)}`;
}

/** "YYYY-MM-DD" と "HH:MM" → ISO */
export function combine(key: DateKey, hhmm: string): ISODateTime {
  const { year, month, day } = parseDateKey(key);
  const [h, m] = hhmm.split(":").map(Number);
  return toISO(fromJst(year, month, day, h, m));
}

/** ISO → "HH:MM"（input[type=time]用） */
export function hhmmOf(iso: ISODateTime): string {
  return formatTime(iso);
}

export function minutesBetween(a: ISODateTime, b: ISODateTime): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / MINUTE);
}

export function addMinutes(iso: ISODateTime, min: number): ISODateTime {
  return toISO(new Date(new Date(iso).getTime() + min * MINUTE));
}

export function monthKey(d: Date): string {
  const p = jstParts(d);
  return `${p.year}-${pad(p.month)}`;
}

export function addMonthsKey(mk: string, n: number): string {
  const [y, m] = mk.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

export function formatMonth(mk: string): string {
  const [y, m] = mk.split("-").map(Number);
  return `${y}年${m}月`;
}

export function daysInMonth(mk: string): number {
  const [y, m] = mk.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 時間帯が重なるか */
export function overlaps(aStart: ISODateTime, aEnd: ISODateTime, bStart: ISODateTime, bEnd: ISODateTime): boolean {
  return new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd);
}

export function formatYen(n: number): string {
  return `${n.toLocaleString("ja-JP")}円`;
}
