// 出欠表を Google スプレッドシートとして作るための「依頼の中身」を組み立てる処理
// （Google への送信は src/services/googleSheetsExport.ts が行います。ここはデータを作るだけ）
// 参考：Sheets API spreadsheets.create の Spreadsheet / GridData / CellData の形
import type { AttendanceSheet, SheetCell } from "./attendanceSheet";

type Color = { red: number; green: number; blue: number };
const rgb = (hex: string): Color => ({
  red: parseInt(hex.slice(1, 3), 16) / 255,
  green: parseInt(hex.slice(3, 5), 16) / 255,
  blue: parseInt(hex.slice(5, 7), 16) / 255,
});

const LINE = { style: "SOLID", color: rgb("#bfbfbf") };
const BORDERS = { top: LINE, bottom: LINE, left: LINE, right: LINE };
const HEAD_BG = rgb("#edf2f2");

type Kind = "title" | "header" | "text" | "center" | "number" | "totalLabel" | "totalCenter" | "totalNumber";

function format(kind: Kind) {
  const bold = kind === "title" || kind === "header" || kind.startsWith("total");
  const bg = kind === "header" || kind.startsWith("total") ? HEAD_BG : undefined;
  const center = kind === "header" || kind === "center" || kind === "totalCenter";
  const number = kind === "number" || kind === "totalNumber";
  return {
    textFormat: { bold, ...(kind === "title" ? { fontSize: 14 } : {}) },
    ...(bg ? { backgroundColor: bg } : {}),
    ...(center ? { horizontalAlignment: "CENTER" } : {}),
    ...(number ? { numberFormat: { type: "NUMBER", pattern: "#,##0" } } : {}),
    ...(kind === "title" ? {} : { borders: BORDERS }),
    verticalAlignment: "MIDDLE",
  };
}

function cell(v: SheetCell, kind: Kind) {
  const value =
    v === null || v === "" ? undefined : typeof v === "number" ? { numberValue: v } : { stringValue: v };
  return { ...(value ? { userEnteredValue: value } : {}), userEnteredFormat: format(kind) };
}

/** 固定する行数（表題・見出し） */
export const FROZEN_ROWS = 2;

/**
 * spreadsheets.create に送る内容。
 * 1行目に表題、2行目に見出し。表題・見出しの2行と、氏名・会員番号の2列を固定します。
 */
export function buildSpreadsheetRequest(sheet: AttendanceSheet, opts: { fileTitle: string; sheetTitle: string }) {
  const afterDates = sheet.dateColStart + sheet.dateCount; // 利用回数の列
  const bodyKind = (c: number): Kind =>
    c < sheet.fixedCols ? "text" : c <= afterDates + 1 ? "center" : "number"; // ○・回数・割合は中央、単価・金額は数値
  const totalKind = (c: number): Kind => (c < sheet.fixedCols ? "totalLabel" : c <= afterDates ? "totalCenter" : "totalNumber");

  const rows = [
    [cell(sheet.title, "title")],
    sheet.header.map((v) => cell(v, "header")),
    ...sheet.rows.map((row) => row.map((v, c) => cell(v, bodyKind(c)))),
    sheet.total.map((v, c) => cell(v, totalKind(c))),
  ];
  const columnCount = sheet.header.length;
  const widths = sheet.header.map((_, c) =>
    c === 0 ? 120 : c === 1 ? 72 : c < afterDates ? 44 : c === afterDates + 3 ? 84 : 68,
  );

  return {
    properties: { title: opts.fileTitle, locale: "ja_JP", timeZone: "Asia/Tokyo" },
    sheets: [
      {
        properties: {
          title: opts.sheetTitle,
          gridProperties: {
            rowCount: rows.length,
            columnCount,
            frozenRowCount: FROZEN_ROWS,
            frozenColumnCount: sheet.fixedCols,
          },
        },
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData: rows.map((values) => ({ values })),
            columnMetadata: widths.map((pixelSize) => ({ pixelSize })),
          },
        ],
      },
    ],
  };
}
