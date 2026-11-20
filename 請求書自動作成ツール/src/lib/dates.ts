import { WEEKDAY_LABELS } from "@/config";
import type { DateKey, MonthKey } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

/** 端末の時刻で今日の日付を返す */
export function todayKey(now: Date = new Date()): DateKey {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function parseKey(key: DateKey): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

export function isDateKey(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parseKey(s);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function isMonthKey(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

/** 0=日 ... 6=土 */
export function weekdayOf(key: DateKey): number {
  const { y, m, d } = parseKey(key);
  return new Date(y, m - 1, d).getDay();
}

export function monthOf(key: DateKey): MonthKey {
  return key.slice(0, 7);
}

export function addMonths(ym: MonthKey, diff: number): MonthKey {
  const [y, m] = ym.split("-").map(Number);
  const dt = new Date(y, m - 1 + diff, 1);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`;
}

export function addDays(key: DateKey, diff: number): DateKey {
  const { y, m, d } = parseKey(key);
  return todayKey(new Date(y, m - 1, d + diff));
}

/** 指定した月の全日付 */
export function daysInMonth(ym: MonthKey): DateKey[] {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${ym}-${pad(i + 1)}`);
}

/** 例：2026年11月20日（金） */
export function formatDateLong(key: DateKey): string {
  const { y, m, d } = parseKey(key);
  return `${y}年${m}月${d}日（${WEEKDAY_LABELS[weekdayOf(key)]}）`;
}

/** 例：11/20（金） */
export function formatDateShort(key: DateKey): string {
  const { m, d } = parseKey(key);
  return `${m}/${d}（${WEEKDAY_LABELS[weekdayOf(key)]}）`;
}

/** 例：2026年11月 */
export function formatMonth(ym: MonthKey): string {
  const [y, m] = ym.split("-").map(Number);
  return `${y}年${m}月`;
}

/** 例：11/20 10:32 */
export function formatDateTime(iso: string): string {
  const dt = new Date(iso);
  return `${dt.getMonth() + 1}/${dt.getDate()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}
