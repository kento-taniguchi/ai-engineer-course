// アプリのデータ（会員・出欠）と、Google スプレッドシートの「行」を行き来させる変換
// Google とは通信しません（通信は src/services/sheetsRepository.ts）。
// 人が開いても読めるよう、曜日は「月,水」、状態は「利用／欠席／未確認」のように書きます。
import { WEEKDAY_LABELS } from "@/config";
import { isDateKey, isMonthKey } from "./dates";
import { isCopayRatio } from "./members";
import type { AttendanceStatus, DayRecord, Member } from "./types";

export const APP_ID = "attendance-invoice";
export const FORMAT_VERSION = 1;

/** シート名 */
export const SHEET = {
  info: "情報",
  members: "会員",
  schedules: "利用曜日",
  copays: "負担割合",
  attendance: "出欠",
} as const;
export type DataSheet = Exclude<(typeof SHEET)[keyof typeof SHEET], "情報">;

/** 各シートの見出し（1行目） */
export const HEADERS: Record<DataSheet, string[]> = {
  会員: ["会員ID", "氏名", "ふりがな", "退会日", "作成日時", "更新日時"],
  利用曜日: ["会員ID", "開始日", "曜日"],
  負担割合: ["会員ID", "適用開始月", "割合（1〜3割）"],
  出欠: ["日付", "会員ID", "氏名（確認用）", "状態", "追加", "保存日時"],
};

export type Cell = string | number;
export type Rows = Cell[][];

const STATUS_TO_TEXT: Record<AttendanceStatus, string> = { present: "利用", absent: "欠席", unconfirmed: "未確認" };
const TEXT_TO_STATUS: Record<string, AttendanceStatus> = { 利用: "present", 欠席: "absent", 未確認: "unconfirmed" };
const ADDED_TEXT = "追加";

export const weekdaysToText = (w: number[]) => w.map((n) => WEEKDAY_LABELS[n]).join(",");

export function textToWeekdays(text: string): number[] | null {
  const parts = text.split(/[,、・\s]+/).filter(Boolean);
  const nums = parts.map((p) => WEEKDAY_LABELS.indexOf(p as (typeof WEEKDAY_LABELS)[number]));
  return nums.length && nums.every((n) => n >= 0) ? nums : null;
}

/** 情報シートの中身 */
export function infoRows(nowIso: string): Rows {
  return [
    ["アプリ", APP_ID],
    ["形式", FORMAT_VERSION],
    ["注意", "このファイルは「利用記録・請求書」アプリが使います。シート名・列・内容を手で書き換えないでください（変更はアプリの画面から行います）。"],
    ["作成日時", nowIso],
    ["最終保存", nowIso],
  ];
}

/** 情報シートの「最終保存」の場所（別の画面で更新されていないかの確認に使う） */
export const LAST_SAVED_CELL = "'情報'!B5";

/** 情報シートを読んで、このアプリのデータ用スプレッドシートか確かめる */
export function isAppInfo(rows: unknown[][]): boolean {
  return String(rows?.[0]?.[1] ?? "") === APP_ID && Number(rows?.[1]?.[1]) === FORMAT_VERSION;
}

// ---- 会員 ----

export function membersToRows(members: Member[]): Record<"会員" | "利用曜日" | "負担割合", Rows> {
  const sorted = [...members].sort((a, b) => a.id.localeCompare(b.id));
  return {
    会員: sorted.map((m) => [m.id, m.name, m.kana, m.withdrawnOn ?? "", m.createdAt, m.updatedAt]),
    利用曜日: sorted.flatMap((m) =>
      [...m.schedules].sort((a, b) => a.from.localeCompare(b.from)).map((s) => [m.id, s.from, weekdaysToText(s.weekdays)]),
    ),
    負担割合: sorted.flatMap((m) =>
      [...m.copays].sort((a, b) => a.from.localeCompare(b.from)).map((c) => [m.id, c.from, c.ratio]),
    ),
  };
}

/** 読めない行があったときのエラー（どのシートの何行目か） */
export class SheetFormatError extends Error {}

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v)).trim();
const isBlank = (row: unknown[]) => !row || row.every((v) => str(v) === "");
/** 行番号（見出しが1行目なので、データの0番目は2行目） */
const rowNo = (i: number) => i + 2;

export function rowsToMembers(memberRows: unknown[][], scheduleRows: unknown[][], copayRows: unknown[][]): Member[] {
  const errors: string[] = [];
  const byId = new Map<string, Member>();
  memberRows.forEach((r, i) => {
    if (isBlank(r)) return;
    const [id, name, kana, withdrawnOn, createdAt, updatedAt] = r.map(str);
    if (!id || !name) return void errors.push(`会員シートの${rowNo(i)}行目：会員IDか氏名が空です`);
    if (byId.has(id)) return void errors.push(`会員シートの${rowNo(i)}行目：会員ID「${id}」が重複しています`);
    if (withdrawnOn && !isDateKey(withdrawnOn)) return void errors.push(`会員シートの${rowNo(i)}行目：退会日「${withdrawnOn}」が読めません（例：2026-11-20）`);
    byId.set(id, { id, name, kana, schedules: [], copays: [], withdrawnOn: withdrawnOn || null, createdAt, updatedAt });
  });
  scheduleRows.forEach((r, i) => {
    if (isBlank(r)) return;
    const [id, from, text] = r.map(str);
    const m = byId.get(id);
    const weekdays = textToWeekdays(text);
    if (!m) return void errors.push(`利用曜日シートの${rowNo(i)}行目：会員ID「${id}」が会員シートにありません`);
    if (!isDateKey(from)) return void errors.push(`利用曜日シートの${rowNo(i)}行目：開始日「${from}」が読めません（例：2026-11-20）`);
    if (!weekdays) return void errors.push(`利用曜日シートの${rowNo(i)}行目：曜日「${text}」が読めません（例：月,水）`);
    m.schedules.push({ from, weekdays });
  });
  copayRows.forEach((r, i) => {
    if (isBlank(r)) return;
    const [id, from, ratioText] = r.map(str);
    const m = byId.get(id);
    const ratio = Number(ratioText.replace(/割$/, ""));
    if (!m) return void errors.push(`負担割合シートの${rowNo(i)}行目：会員ID「${id}」が会員シートにありません`);
    if (!isMonthKey(from)) return void errors.push(`負担割合シートの${rowNo(i)}行目：適用開始月「${from}」が読めません（例：2026-11）`);
    if (!isCopayRatio(ratio)) return void errors.push(`負担割合シートの${rowNo(i)}行目：割合「${ratioText}」は 1・2・3 のどれかにしてください`);
    m.copays.push({ from, ratio });
  });
  for (const m of byId.values()) {
    if (m.schedules.length === 0) errors.push(`会員「${m.name}（${m.id}）」の利用曜日が利用曜日シートにありません`);
    if (m.copays.length === 0) m.copays.push({ from: "2000-01", ratio: 1 }); // 割合がなければ1割
  }
  if (errors.length) throw new SheetFormatError(errors.slice(0, 5).join("\n") + (errors.length > 5 ? `\nほか ${errors.length - 5}件` : ""));
  return [...byId.values()];
}

// ---- 出欠 ----

/** 日付順に並べた出欠の行（同じ日の中は画面の並び順のまま） */
export function daysToRows(days: DayRecord[], nameOf: (id: string) => string): Rows {
  return [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((d) =>
      d.entries.map((e) => [d.date, e.memberId, nameOf(e.memberId), STATUS_TO_TEXT[e.status], e.added ? ADDED_TEXT : "", d.savedAt]),
    );
}

export function rowsToDays(rows: unknown[][]): DayRecord[] {
  const errors: string[] = [];
  const byDate = new Map<string, DayRecord>();
  rows.forEach((r, i) => {
    if (isBlank(r)) return;
    const [date, memberId, , statusText, addedText, savedAt] = r.map(str);
    const status = TEXT_TO_STATUS[statusText];
    if (!isDateKey(date)) return void errors.push(`出欠シートの${rowNo(i)}行目：日付「${date}」が読めません（例：2026-11-20）`);
    if (!memberId) return void errors.push(`出欠シートの${rowNo(i)}行目：会員IDが空です`);
    if (!status) return void errors.push(`出欠シートの${rowNo(i)}行目：状態「${statusText}」が読めません（利用・欠席・未確認のどれか）`);
    let rec = byDate.get(date);
    if (!rec) byDate.set(date, (rec = { date, entries: [], savedAt }));
    rec.entries.push({ memberId, status, added: addedText === ADDED_TEXT });
  });
  if (errors.length) throw new SheetFormatError(errors.slice(0, 5).join("\n") + (errors.length > 5 ? `\nほか ${errors.length - 5}件` : ""));
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ---- 書き込む範囲を最小にする ----

/** 2つの行が同じか（Google から読むと行末の空欄は省かれるので、空欄を補って比べる） */
const sameRow = (a: unknown[] | undefined, b: unknown[] | undefined) => {
  if (!a || !b) return false;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (str(a[i]) !== str(b[i])) return false;
  return true;
};

/**
 * 前回の内容（old）から新しい内容（next）にするとき、書き込みが必要な範囲。
 * 最初に違う行から後ろだけを書き、行が減った分は消します。
 * from：書き始める行（データの何番目か。0＝シートの2行目）、clearTo：消す必要がある最後の位置（なければ from+rows.length 以下）
 */
export function planWrite(old: unknown[][], next: Rows): { from: number; rows: Rows; clearFrom: number; clearTo: number } | null {
  let i = 0;
  while (i < next.length && sameRow(old[i], next[i])) i++;
  if (i === next.length && old.length <= next.length) return null; // 変更なし
  return { from: i, rows: next.slice(i), clearFrom: next.length, clearTo: old.length };
}

/** シートの範囲を書く（例：'出欠'!A2） */
export const a1 = (sheet: string, fromRow: number, col = "A", toRow?: number, toCol?: string) =>
  `'${sheet}'!${col}${fromRow}` + (toRow !== undefined ? `:${toCol ?? col}${toRow}` : "");

// ---- データ用スプレッドシートを新しく作るとき ----

const HEADER_FORMAT = {
  textFormat: { bold: true },
  backgroundColor: { red: 0.93, green: 0.95, blue: 0.95 },
};
const COLUMN_WIDTHS: Record<DataSheet, number[]> = {
  会員: [80, 120, 140, 100, 190, 190],
  利用曜日: [80, 100, 120],
  負担割合: [80, 100, 110],
  出欠: [100, 80, 120, 70, 60, 190],
};
const INITIAL_ROWS: Record<DataSheet, number> = { 会員: 500, 利用曜日: 1000, 負担割合: 1000, 出欠: 5000 };

const textCell = (v: Cell, format?: object) => ({
  userEnteredValue: typeof v === "number" ? { numberValue: v } : { stringValue: v },
  ...(format ? { userEnteredFormat: format } : {}),
});

/** spreadsheets.create に送る内容（見出しを入れて、1行目を固定） */
export function buildDataSpreadsheetRequest(title: string, nowIso: string) {
  const dataSheets = (Object.keys(HEADERS) as DataSheet[]).map((name) => ({
    properties: {
      title: name,
      gridProperties: { rowCount: INITIAL_ROWS[name], columnCount: HEADERS[name].length, frozenRowCount: 1 },
    },
    data: [
      {
        startRow: 0,
        startColumn: 0,
        rowData: [{ values: HEADERS[name].map((h) => textCell(h, HEADER_FORMAT)) }],
        columnMetadata: COLUMN_WIDTHS[name].map((pixelSize) => ({ pixelSize })),
      },
    ],
  }));
  return {
    properties: { title, locale: "ja_JP", timeZone: "Asia/Tokyo" },
    sheets: [
      {
        properties: { title: SHEET.info, gridProperties: { rowCount: 10, columnCount: 2 } },
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData: infoRows(nowIso).map((r) => ({ values: r.map((v) => textCell(v)) })),
            columnMetadata: [{ pixelSize: 90 }, { pixelSize: 640 }],
          },
        ],
      },
      ...dataSheets,
    ],
  };
}

/** 各シートに「手で編集しようとすると警告が出る」保護をかける依頼（batchUpdate 用） */
export function buildProtectionRequests(sheets: { sheetId: number; title: string }[]) {
  return sheets.map((s) => ({
    addProtectedRange: {
      protectedRange: {
        range: { sheetId: s.sheetId },
        description: "アプリが使うデータです。変更はアプリの画面から行ってください。",
        warningOnly: true,
      },
    },
  }));
}
