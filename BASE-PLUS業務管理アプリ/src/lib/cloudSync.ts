// PC・iPhone間でデータを共有するための「判断のルール」（画面・通信から分離。自動テストで確認する）。
//
// 方針（docs/データ共有の設計.md）
//  - クラウドには AppData を1つの文書として保存し、「版番号（revision）」で上書き事故を防ぐ
//    （別の端末が先に保存していたら、黙って上書きせず「他の端末で更新されています」と知らせる）
//  - 既存のブラウザ内データは、本人が内容（件数）を確認して「アップロードする」を押したときだけ送る
//  - 架空でない選手・チームが含まれる場合は、本番の準備（同意・アクセス制御の確認）の確認を必須にする
//  - 端末ごとの設定（デモ用の時刻ずらしなど）はクラウドに送らない

import type { AppData, Todo } from "./types";
import { DATA_VERSION } from "./migrate";

export interface DataSummary {
  players: number;
  teams: number;
  bookings: number;
  todos: number;
  reports: number;
  lessonPlans: number;
  measurements: number;
  attachments: number;
  /** ブラウザ内（IndexedDB）にだけ保存されている画像・動画の数（JSONには含まれず、別にアップロードが必要） */
  localMedia: number;
}

export function summarizeData(d: AppData): DataSummary {
  const localMedia = (d.seminars ?? []).reduce((n, s) => n + (s.thumbnail?.stored ? 1 : 0) + (s.video?.stored ? 1 : 0), 0);
  return {
    players: d.players?.length ?? 0,
    teams: d.teams?.length ?? 0,
    bookings: d.bookings?.length ?? 0,
    todos: d.todos?.length ?? 0,
    reports: d.reports?.length ?? 0,
    lessonPlans: d.lessonPlans?.length ?? 0,
    measurements: d.measurements?.length ?? 0,
    attachments: d.attachments?.length ?? 0,
    localMedia,
  };
}

export function formatSummary(s: DataSummary): string {
  return `選手 ${s.players}名・チーム ${s.teams}件・予約 ${s.bookings}件・ToDo ${s.todos}件・レポート ${s.reports}件・指導メモ ${s.lessonPlans}件・測定 ${s.measurements}件`;
}

/** 書き出したファイル・クラウドから受け取ったデータの形を確認する（設定画面の「戻す」と共通） */
export function validateAppDataShape(d: unknown): { ok: true; data: AppData } | { ok: false; error: string } {
  const x = d as Partial<AppData> | null;
  const okShape = !!x && typeof x === "object" && Array.isArray(x.players) && Array.isArray(x.bookings) && Array.isArray(x.todos) && Array.isArray(x.reports);
  if (!okShape) return { ok: false, error: "このアプリで書き出したデータではないようです" };
  if (typeof x.version === "number" && x.version > DATA_VERSION) return { ok: false, error: "新しい版のアプリで保存されたデータです（このアプリを更新してください）" };
  return { ok: true, data: x as AppData };
}

const DEMO_MARK = "（架空）";

/**
 * 架空（デモ）でない選手・チームの数。
 * デモデータは所属・チーム名に「（架空）」が付いている。付いていないものは実在の情報の可能性があるとみなす。
 */
export function realLookingRecords(d: AppData): { players: string[]; teams: string[] } {
  const players = d.players.filter((p) => ![p.affiliation, p.contactMemo, p.name].some((s) => (s ?? "").includes(DEMO_MARK))).map((p) => p.id);
  const teams = (d.teams ?? []).filter((t) => !t.name.includes(DEMO_MARK)).map((t) => t.id);
  return { players, teams };
}

/** クラウドへ送る前に、端末ごとの設定を取り除く（元のデータは変更しない） */
export function prepareForCloud(d: AppData): AppData {
  return {
    ...d,
    settings: { ...d.settings, clockOffsetMin: 0, simulateSyncFailure: false },
  };
}

/** クラウドから受け取ったデータに、この端末の設定を戻す */
export function mergeDeviceSettings(remote: AppData, local: AppData | null): AppData {
  if (!local) return remote;
  return { ...remote, settings: { ...remote.settings, clockOffsetMin: local.settings.clockOffsetMin, simulateSyncFailure: local.settings.simulateSyncFailure } };
}

/**
 * 項目の並び順に左右されない文字列にする。
 * クラウドのデータベース（PostgreSQL の jsonb）は保存時に項目の順番を並べ替えるため、
 * そのまま JSON.stringify で比べると、同じ内容でも「違う」と判定してしまう。
 */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : canonicalJson(x))).join(",")}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
}

/**
 * 自動で作られ、まだ一度も触っていないToDo。
 * 予約・繰り返しの仕事などから、どの端末でも同じIDで作り直されるため、「変更」とはみなさない。
 */
export function isPristineTodo(t: Todo): boolean {
  return (
    t.status === "todo" &&
    !t.statusReason &&
    (t.history?.length ?? 0) === 0 &&
    !t.block &&
    !t.needsReview &&
    !t.draft &&
    !t.postponedTo &&
    !t.gcal &&
    !t.statusChangedAt
  );
}

/**
 * 内容を比べるための形。次のものは端末ごとに作り直せる・その端末だけの情報なので比べない：
 *  - 端末ごとの設定（デモ用の時刻など）
 *  - Googleカレンダーの控え（読み込んだ予定・期間・連携の履歴）。紐づけ・予約の変更は bookings 側に残るので比べる
 *  - 自動で作られ、まだ触っていないToDo
 */
function comparable(d: AppData): string {
  const p = prepareForCloud(d);
  const g = p.google ?? ({} as AppData["google"]);
  return canonicalJson({
    ...p,
    todos: (p.todos ?? []).filter((t) => !isPristineTodo(t)),
    google: { ...g, logs: [], lastSync: undefined, events: [], range: undefined, calendars: [] },
  });
}

/** 内容の指紋（端末ごとの設定・連携の履歴を除く）。最後に同期した内容から変わったかの判定に使う */
export function dataFingerprint(d: AppData): string {
  const s = comparable(d);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return `${h1.toString(16)}${h2.toString(16)}-${s.length}`;
}

export function sameSummary(a: DataSummary, b: DataSummary): boolean {
  return (Object.keys(a) as (keyof DataSummary)[]).filter((k) => k !== "localMedia").every((k) => a[k] === b[k]);
}

export type InitialSyncDecision =
  /** クラウドが空：本人が件数を確認してからアップロード */
  | { action: "offer-upload"; local: DataSummary; needsRealDataConfirm: boolean }
  /** この端末が空：クラウドのデータを使う（この端末のデータは退避してから） */
  | { action: "use-remote"; remote: DataSummary }
  /** 同じ内容 */
  | { action: "same" }
  /** 両方にデータがあり内容が違う：本人が選ぶ（自動で上書きしない） */
  | { action: "ask"; local: DataSummary; remote: DataSummary };

/** 初めてクラウドにつないだ端末で、どちらのデータを使うかを決める */
export function decideInitialSync(local: AppData | null, remote: AppData | null): InitialSyncDecision {
  if (!remote) {
    if (!local) return { action: "same" };
    const r = realLookingRecords(local);
    return { action: "offer-upload", local: summarizeData(local), needsRealDataConfirm: r.players.length + r.teams.length > 0 };
  }
  if (!local) return { action: "use-remote", remote: summarizeData(remote) };
  if (comparable(local) === comparable(remote)) return { action: "same" };
  return { action: "ask", local: summarizeData(local), remote: summarizeData(remote) };
}

export type AutoSyncAction =
  /** 何もしない（同期済み） */
  | "none"
  /** この端末の変更をクラウドに保存 */
  | "push"
  /** 他の端末の変更をこの端末に読み込む（この端末に未保存の変更がないので安全） */
  | "pull"
  /** 内容は同じなので、版番号の記録だけそろえる */
  | "adopt"
  /** 両方で別々に変更された：本人に選んでもらう（自動で上書きしない） */
  | "conflict"
  /** この端末はまだクラウドとつないでいない：最初の選択が必要 */
  | "setup";

/**
 * 自動同期で次に何をするかを決める。
 * meta はこの端末が最後に同期したときの版番号と内容の指紋、remote はクラウドの最新。
 */
export function decideAutoSync(
  meta: { revision: number; fingerprint: string } | null,
  localFp: string,
  remote: { revision: number; fingerprint: string } | null,
): AutoSyncAction {
  if (!remote) return "setup";
  if (!meta) return remote.fingerprint === localFp ? "adopt" : "setup";
  const localChanged = localFp !== meta.fingerprint;
  if (remote.revision === meta.revision) return localChanged ? "push" : "none";
  if (remote.fingerprint === localFp) return "adopt";
  if (remote.revision > meta.revision && !localChanged) return "pull";
  return "conflict";
}

/** 保存時の版番号の確認（データベース側の save_app_state 関数と同じルール） */
export function checkRevision(baseRevision: number, remoteRevision: number | null): "ok" | "conflict" {
  const cur = remoteRevision ?? 0;
  return cur === baseRevision ? "ok" : "conflict";
}

/** 写真・動画のクラウド上の保存場所（本人のフォルダの下だけ。データベースのアクセス制御もこの形を前提にしている） */
export function mediaPath(ownerId: string, mediaId: string, fileName: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(ownerId)) throw new Error("ユーザーIDの形式が正しくありません");
  const ext = (fileName.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] ?? "bin").toLowerCase();
  const safeId = mediaId.replace(/[^A-Za-z0-9_-]/g, "");
  if (!safeId) throw new Error("ファイルIDが正しくありません");
  return `${ownerId}/${safeId}.${ext}`;
}
