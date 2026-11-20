// 本番の保存先：Google スプレッドシート（クライアントの Google ドライブ）
// - 起動時に全シートを読み込み、アプリの中に持っておきます
// - 保存のたびに「変わった部分だけ」を書き込みます。書き込みに成功してから、アプリの中のデータを更新します
// - 同じスプレッドシートを別の画面（別のタブ）で更新していたら、上書きせずに止めます
// - ブラウザに残すのは、スプレッドシートの ID（場所）だけです（会員・出欠のデータは残しません）
import { normalizeMember } from "@/lib/members";
import { monthOf } from "@/lib/dates";
import {
  a1, buildDataSpreadsheetRequest, buildProtectionRequests, daysToRows, HEADERS, isAppInfo, LAST_SAVED_CELL,
  membersToRows, planWrite, rowsToDays, rowsToMembers, SHEET, type DataSheet, type Rows,
} from "@/lib/sheetsFormat";
import type { DayRecord, Member } from "@/lib/types";
import { googleFetch, GoogleError } from "./googleAuth";
import type { BackupData, Repository } from "./repository";
import { validateBackup } from "./localRepository";

const API = "https://sheets.googleapis.com/v4/spreadsheets";
const ID_KEY = "attendance-invoice:spreadsheet-id";
const DATA_SHEETS = Object.keys(HEADERS) as DataSheet[];
const lastCol = (s: DataSheet) => String.fromCharCode(64 + HEADERS[s].length); // 例：6列 → F

type Loaded = {
  id: string;
  members: Member[];
  days: Map<string, DayRecord>;
  /** 最後に読み書きしたシートの中身（変わった部分を見つけるため） */
  written: Record<DataSheet, unknown[][]>;
  sheetIds: Record<DataSheet, number>;
  rowCount: Record<DataSheet, number>;
  /** 情報シートの「最終保存」（別の画面で更新されていないかの確認用） */
  lastSaved: string;
};

let data: Loaded | null = null;

const enc = encodeURIComponent;
export const spreadsheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;

/** URL か ID を受け取り、スプレッドシートの ID を取り出す */
export function parseSpreadsheetId(input: string): string | null {
  const t = input.trim();
  const m = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(t) ? t : null;
}

// ---- スプレッドシートの場所（このPCのブラウザに覚えておく） ----

export const savedSpreadsheetId = () => window.localStorage.getItem(ID_KEY);
export function forgetSpreadsheet() {
  window.localStorage.removeItem(ID_KEY);
  data = null;
}
export const isLoaded = () => data !== null;
export const currentSpreadsheetId = () => data?.id ?? null;

// ---- 読み込み ----

type ValueRange = { range: string; values?: unknown[][] };

/** スプレッドシートを読み込んで使えるようにする */
export async function connectSpreadsheet(id: string): Promise<void> {
  const meta = await googleFetch<{ sheets: { properties: { sheetId: number; title: string; gridProperties?: { rowCount?: number } } }[] }>(
    `${API}/${enc(id)}?fields=${enc("sheets.properties(sheetId,title,gridProperties.rowCount)")}`,
  );
  const byTitle = new Map(meta.sheets.map((s) => [s.properties.title, s.properties]));
  const missing = [SHEET.info, ...DATA_SHEETS].filter((t) => !byTitle.has(t));
  if (missing.length)
    throw new GoogleError(`このスプレッドシートは、このアプリのデータ用ではないようです（「${missing.join("」「")}」シートがありません）。`);

  const ranges = [a1(SHEET.info, 1, "A", 5, "B"), ...DATA_SHEETS.map((s) => `'${s}'!A2:${lastCol(s)}`)];
  const got = await googleFetch<{ valueRanges: ValueRange[] }>(
    `${API}/${enc(id)}/values:batchGet?valueRenderOption=UNFORMATTED_VALUE&${ranges.map((r) => `ranges=${enc(r)}`).join("&")}`,
  );
  const [info, ...rest] = got.valueRanges.map((v) => v.values ?? []);
  if (!isAppInfo(info)) throw new GoogleError("このスプレッドシートは、このアプリのデータ用ではないようです（「情報」シートの内容が違います）。");
  const values = Object.fromEntries(DATA_SHEETS.map((s, i) => [s, rest[i]])) as Record<DataSheet, unknown[][]>;

  const members = rowsToMembers(values["会員"], values["利用曜日"], values["負担割合"]).map(normalizeMember);
  const days = rowsToDays(values["出欠"]);
  data = {
    id,
    members,
    days: new Map(days.map((d) => [d.date, d])),
    written: values,
    sheetIds: Object.fromEntries(DATA_SHEETS.map((s) => [s, byTitle.get(s)!.sheetId])) as Record<DataSheet, number>,
    rowCount: Object.fromEntries(DATA_SHEETS.map((s) => [s, byTitle.get(s)!.gridProperties?.rowCount ?? 1000])) as Record<DataSheet, number>,
    lastSaved: String(info[4]?.[1] ?? ""),
  };
  window.localStorage.setItem(ID_KEY, id);
}

/** データ用のスプレッドシートを新しく作り、使えるようにする。戻り値は ID */
export async function createDataSpreadsheet(title: string): Promise<string> {
  const now = new Date().toISOString();
  const created = await googleFetch<{ spreadsheetId: string; sheets: { properties: { sheetId: number; title: string } }[] }>(API, {
    method: "POST",
    body: buildDataSpreadsheetRequest(title, now),
  });
  // 手で編集しようとすると警告が出るようにする（失敗してもデータには影響しないので続ける）
  try {
    await googleFetch(`${API}/${enc(created.spreadsheetId)}:batchUpdate`, {
      method: "POST",
      body: { requests: buildProtectionRequests(created.sheets.map((s) => s.properties)) },
    });
  } catch {
    /* 保護がかからなくても使える */
  }
  await connectSpreadsheet(created.spreadsheetId);
  return created.spreadsheetId;
}

// ---- 書き込み ----

function need(): Loaded {
  if (!data) throw new GoogleError("データのスプレッドシートを読み込んでいません。画面を再読み込みしてください。");
  return data;
}

/** 別の画面で更新されていないか確かめる */
async function checkNotChangedElsewhere(d: Loaded) {
  const got = await googleFetch<{ values?: unknown[][] }>(`${API}/${enc(d.id)}/values/${enc(LAST_SAVED_CELL)}?valueRenderOption=UNFORMATTED_VALUE`);
  const now = String(got.values?.[0]?.[0] ?? "");
  if (now !== d.lastSaved)
    throw new GoogleError(
      "別の画面（別のタブやPC）でデータが更新されています。上書きしないように保存を止めました。\nブラウザの再読み込み（F5）をしてから、もう一度入力・保存してください。",
    );
}

/** 新しい中身をシートに書く（変わった部分だけ）。成功したら written を更新 */
async function writeSheets(d: Loaded, next: Partial<Record<DataSheet, Rows>>) {
  const plans = (Object.keys(next) as DataSheet[])
    .map((s) => ({ s, rows: next[s]!, plan: planWrite(d.written[s], next[s]!) }))
    .filter((x) => x.plan !== null);
  if (plans.length === 0) return;

  await checkNotChangedElsewhere(d);

  // 行が足りなければ、シートの行を増やす
  const grow = plans
    .filter(({ s, rows }) => rows.length + 1 > d.rowCount[s])
    .map(({ s, rows }) => ({ s, add: rows.length + 1 - d.rowCount[s] + 1000 }));
  if (grow.length) {
    await googleFetch(`${API}/${enc(d.id)}:batchUpdate`, {
      method: "POST",
      body: { requests: grow.map(({ s, add }) => ({ appendDimension: { sheetId: d.sheetIds[s], dimension: "ROWS", length: add } })) },
    });
    for (const { s, add } of grow) d.rowCount[s] += add;
  }

  const savedAt = new Date().toISOString();
  const writes = plans
    .filter(({ plan }) => plan!.rows.length > 0)
    .map(({ s, plan }) => ({ range: a1(s, plan!.from + 2), values: plan!.rows }));
  await googleFetch(`${API}/${enc(d.id)}/values:batchUpdate`, {
    method: "POST",
    body: { valueInputOption: "RAW", data: [...writes, { range: LAST_SAVED_CELL, values: [[savedAt]] }] },
  });
  d.lastSaved = savedAt;

  const clears = plans
    .filter(({ plan }) => plan!.clearTo > plan!.clearFrom)
    .map(({ s, plan }) => a1(s, plan!.clearFrom + 2, "A", plan!.clearTo + 1, lastCol(s)));
  if (clears.length) {
    await googleFetch(`${API}/${enc(d.id)}/values:batchClear`, { method: "POST", body: { ranges: clears } });
  }
  for (const { s, rows } of plans) d.written[s] = rows.map((r) => [...r]);
}

/** 会員と出欠から、すべてのシートの中身を作る */
function allRows(members: Member[], days: Iterable<DayRecord>): Record<DataSheet, Rows> {
  const names = new Map(members.map((m) => [m.id, m.name]));
  return { ...membersToRows(members), 出欠: daysToRows([...days], (id) => names.get(id) ?? "") };
}

export const sheetsRepository: Repository = {
  label: "Googleスプレッドシート",
  kind: "sheets",
  async listMembers() {
    return need().members.map((m) => structuredClone(m));
  },
  async saveMember(member) {
    const d = need();
    const members = d.members.some((m) => m.id === member.id)
      ? d.members.map((m) => (m.id === member.id ? member : m))
      : [...d.members, member];
    // 出欠シートの「氏名（確認用）」も最新の氏名にそろえる（変わっていなければ書き込まない）
    await writeSheets(d, allRows(members, d.days.values()));
    d.members = members;
  },
  async getDay(date) {
    const rec = need().days.get(date);
    return rec ? structuredClone(rec) : null;
  },
  async saveDay(record) {
    const d = need();
    const days = new Map(d.days);
    days.set(record.date, record);
    const names = new Map(d.members.map((m) => [m.id, m.name]));
    await writeSheets(d, { 出欠: daysToRows([...days.values()], (id) => names.get(id) ?? "") });
    d.days = days;
  },
  async listDaysInMonth(ym) {
    return [...need().days.values()]
      .filter((r) => monthOf(r.date) === ym)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => structuredClone(r));
  },
  async exportAll() {
    const d = need();
    return {
      app: "attendance-invoice",
      version: 1,
      exportedAt: new Date().toISOString(),
      members: d.members,
      days: [...d.days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    } satisfies BackupData;
  },
  async importAll(backup) {
    if (!validateBackup(backup)) throw new Error("このアプリのバックアップファイルではありません");
    const d = need();
    const members = backup.members.map(normalizeMember);
    await writeSheets(d, allRows(members, backup.days));
    d.members = members;
    d.days = new Map(backup.days.map((x) => [x.date, x]));
  },
  async resetToDemo() {
    throw new Error("Googleスプレッドシートに保存しているときは、デモデータに戻せません。");
  },
};
