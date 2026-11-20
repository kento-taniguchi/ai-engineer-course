// 月の出欠表（縦＝会員、横＝日付、利用した日に「○」）を作る処理
// CSV と Google スプレッドシートは、どちらもこの表から作ります（中身が食い違わないように）
import { WEEKDAY_LABELS } from "@/config";
import type { MonthSummary } from "./billing";
import { daysInMonth, formatMonth, parseKey, weekdayOf } from "./dates";

export type SheetCell = string | number | null;

export type AttendanceSheet = {
  title: string;
  /** 1行目（見出し） */
  header: string[];
  /** 会員ごとの行 */
  rows: SheetCell[][];
  /** 最後の合計行 */
  total: SheetCell[];
  /** 左から何列を固定するか（氏名・会員番号） */
  fixedCols: number;
  /** 日付の列の位置（0始まり） */
  dateColStart: number;
  dateCount: number;
};

export const MARK = "○";

/** 例：「1(日)」 */
const dayLabel = (d: string) => `${parseKey(d).d}(${WEEKDAY_LABELS[weekdayOf(d)]})`;

export function buildAttendanceSheet(summary: MonthSummary): AttendanceSheet {
  const days = daysInMonth(summary.ym);
  const header = ["氏名", "会員番号", ...days.map(dayLabel), "利用回数", "負担割合", "単価(円)", "金額(円)"];
  const rows: SheetCell[][] = summary.rows.map((r) => {
    const used = new Set(r.usedDates);
    return [
      r.member.name,
      r.member.id,
      ...days.map((d) => (used.has(d) ? MARK : null)),
      r.count,
      `${r.ratio}割`,
      r.unitPrice,
      r.amount,
    ];
  });
  // 合計行：日ごとの利用人数、回数・金額の合計
  const perDay = days.map((d) => summary.rows.filter((r) => r.usedDates.includes(d)).length);
  const total: SheetCell[] = [
    "合計",
    null,
    ...perDay.map((n) => (n ? n : null)),
    summary.totalCount,
    null,
    null,
    summary.totalAmount,
  ];
  return {
    title: `${formatMonth(summary.ym)} 出欠表`,
    header,
    rows,
    total,
    fixedCols: 2,
    dateColStart: 2,
    dateCount: days.length,
  };
}

/** CSV の1つの値。カンマ・ダブルクォート・改行を含むときは "..." で囲む */
function csvField(v: SheetCell): string {
  if (v === null) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** BOM：Excel に「この CSV は UTF-8（日本語が化けない形式）」と伝える目印の文字 */
const BOM = String.fromCharCode(0xfeff);

/**
 * CSV の文字列。Excel でそのまま開けるよう、先頭に BOM（UTF-8 の目印）を付け、改行は CRLF にします。
 * ※ CSV には「列の固定」などの見た目の設定は保存できません。
 */
export function toCsv(sheet: AttendanceSheet): string {
  const lines = [sheet.header, ...sheet.rows, sheet.total].map((row) => row.map(csvField).join(","));
  return BOM + lines.join("\r\n") + "\r\n";
}

