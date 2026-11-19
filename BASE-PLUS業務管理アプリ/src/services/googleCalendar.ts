// Googleカレンダー連携（Google Identity Services ＋ Google Calendar API）
//
// 方式：ブラウザだけで完結する「トークン方式」（OAuth 2.0 の Token Model）
//  - 必要な設定値は「OAuthクライアントID」だけ（公開される識別子で、秘密情報ではない）
//  - クライアントシークレット・パスワード・APIキーは使わない／保存しない
//  - アクセストークンはメモリ上だけで保持（保存しない・表示しない・ログに出さない）。有効期限は約1時間
//  - 権限は目的ごとに分けて、必要になったときに求める（読み取り → 書き込み）

import type { DateKey, GCalEvent, GoogleCalendarInfo, ISODateTime } from "@/lib/types";
import { combine, toISO } from "@/lib/time";

/** 読み取り：カレンダーの一覧と予定を見る（変更はしない） */
export const READ_SCOPES = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
];
/** 書き込み：自分が所有するカレンダーの予定を作成・変更・削除（作業予定の登録に使う） */
export const WRITE_SCOPES = ["https://www.googleapis.com/auth/calendar.events.owned"];

export const SCOPE_PURPOSE: { scope: string; label: string; purpose: string }[] = [
  { scope: READ_SCOPES[0], label: "カレンダーの一覧を見る", purpose: "読み込むカレンダー・登録先のカレンダーを選ぶため" },
  { scope: READ_SCOPES[1], label: "予定を見る", purpose: "今日のスケジュール・月間予定への表示と、予約の紐づけ・変更の検知のため" },
  { scope: WRITE_SCOPES[0], label: "自分のカレンダーの予定を作成・変更", purpose: "アプリで配置した作業予定を登録するため（登録するときに初めて求めます）" },
];

const CLIENT_ID_RE = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/;

export function isValidClientId(id: string | undefined): boolean {
  return !!id && CLIENT_ID_RE.test(id.trim());
}

/** 環境変数（.env.local）を優先し、なければ設定画面で入力した値を使う */
export function resolveClientId(saved: string | undefined): { id: string | null; from: "env" | "settings" | null } {
  const env = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (isValidClientId(env)) return { id: env!.trim(), from: "env" };
  if (isValidClientId(saved)) return { id: saved!.trim(), from: "settings" };
  return { id: null, from: null };
}

// ---------- Google Identity Services ----------

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string; scope?: string }): void;
}

interface GoogleOAuth2 {
  initTokenClient(cfg: {
    client_id: string;
    scope: string;
    include_granted_scopes?: boolean;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type?: string; message?: string }) => void;
  }): TokenClient;
  revoke(token: string, done?: () => void): void;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

let gisPromise: Promise<GoogleOAuth2> | null = null;

export function loadGis(): Promise<GoogleOAuth2> {
  if (typeof window === "undefined") return Promise.reject(new Error("ブラウザでのみ利用できます"));
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2);
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => (window.google?.accounts?.oauth2 ? resolve(window.google.accounts.oauth2) : reject(new Error("Googleのログイン機能を読み込めませんでした")));
    s.onerror = () => {
      gisPromise = null;
      reject(new Error("Googleのログイン機能を読み込めませんでした（ネットワークを確認してください）"));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

export interface AccessToken {
  value: string;
  expiresAt: number;
  scopes: string[];
}

/** 権限の確認画面（Google）を開き、アクセストークンを受け取る */
export async function requestToken(clientId: string, scopes: string[], prompt: "" | "consent" = ""): Promise<AccessToken> {
  const oauth2 = await loadGis();
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: scopes.join(" "),
      include_granted_scopes: true,
      callback: (r) => {
        if (r.error || !r.access_token) {
          reject(new GoogleApiError("auth", r.error === "access_denied" ? "許可されませんでした（Googleの確認画面で「許可」が選ばれませんでした）" : `認証に失敗しました（${r.error ?? "不明なエラー"}）`));
          return;
        }
        resolve({ value: r.access_token, expiresAt: Date.now() + Number(r.expires_in ?? 3600) * 1000, scopes: (r.scope ?? "").split(" ").filter(Boolean) });
      },
      error_callback: (e) => {
        const t = e?.type;
        reject(
          new GoogleApiError(
            "auth",
            t === "popup_closed" ? "Googleの画面が閉じられました。もう一度お試しください" : t === "popup_failed_to_open" ? "Googleの画面を開けませんでした（ポップアップがブロックされていないか確認してください）" : "Googleの認証を完了できませんでした",
          ),
        );
      },
    });
    client.requestAccessToken({ prompt });
  });
}

export function hasScopes(token: AccessToken | null, scopes: string[]): boolean {
  return !!token && scopes.every((s) => token.scopes.includes(s));
}

export async function revokeToken(token: AccessToken | null): Promise<void> {
  if (!token) return;
  try {
    const oauth2 = await loadGis();
    await new Promise<void>((r) => oauth2.revoke(token.value, () => r()));
  } catch {
    /* 取り消しに失敗しても、アプリ側の接続は解除する */
  }
}

// ---------- Calendar API ----------

export type GoogleErrorKind = "auth" | "permission" | "notfound" | "conflict" | "network" | "other";

export class GoogleApiError extends Error {
  constructor(
    public kind: GoogleErrorKind,
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

const API = "https://www.googleapis.com/calendar/v3";

async function api<T>(token: AccessToken, path: string, init: RequestInit = {}): Promise<T> {
  if (token.expiresAt < Date.now() + 30000) throw new GoogleApiError("auth", "接続の有効期限が切れました。「Googleに再接続」を押してください", 401);
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token.value}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    throw new GoogleApiError("network", "Googleに接続できませんでした（インターネット接続を確認してください）");
  }
  if (res.status === 204) return undefined as T;
  if (res.ok) return (await res.json()) as T;
  let reason = "";
  try {
    const body = await res.json();
    reason = body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? "";
  } catch {
    /* 本文なし */
  }
  if (res.status === 401) throw new GoogleApiError("auth", "接続の有効期限が切れたか、許可が取り消されました。再接続してください", 401);
  if (res.status === 403) {
    if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason))
      throw new GoogleApiError("permission", "Google Cloud で「Google Calendar API」が有効になっていません（設定手順の③を確認してください）", 403);
    if (/rateLimit|quota/i.test(reason)) throw new GoogleApiError("other", "Googleの利用回数の上限に達しました。しばらくしてから再試行してください", 403);
    throw new GoogleApiError("permission", "このカレンダーを操作する権限がありません（自分が所有するカレンダーを選んでください）", 403);
  }
  if (res.status === 404 || res.status === 410) throw new GoogleApiError("notfound", "予定またはカレンダーが見つかりません", res.status);
  if (res.status === 409) throw new GoogleApiError("conflict", "同じIDの予定がすでにあります", 409);
  throw new GoogleApiError("other", `Googleカレンダーでエラーが発生しました（${res.status}）`, res.status);
}

interface RawCalendar {
  id: string;
  summary?: string;
  summaryOverride?: string;
  primary?: boolean;
  accessRole: string;
}

export async function listCalendars(token: AccessToken): Promise<GoogleCalendarInfo[]> {
  const out: GoogleCalendarInfo[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({ maxResults: "250", ...(pageToken ? { pageToken } : {}) });
    const r = await api<{ items?: RawCalendar[]; nextPageToken?: string }>(token, `/users/me/calendarList?${q}`);
    for (const c of r.items ?? []) out.push({ id: c.id, summary: c.summaryOverride ?? c.summary ?? "(名前なし)", primary: c.primary, accessRole: c.accessRole });
    pageToken = r.nextPageToken;
  } while (pageToken);
  return out;
}

export interface RawEvent {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  updated?: string;
  recurringEventId?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
}

/** Googleの予定をアプリの形に変換（日本時間）。終日予定は日付のみで扱う */
export function normalizeEvent(raw: RawEvent, calendarId: string): GCalEvent | null {
  const status = raw.status === "cancelled" ? "cancelled" : raw.status === "tentative" ? "tentative" : "confirmed";
  const base = {
    calendarId,
    eventId: raw.id,
    recurringEventId: raw.recurringEventId,
    title: raw.summary?.trim() || "(タイトルなし)",
    status: status as GCalEvent["status"],
    updated: raw.updated,
    location: raw.location,
    appTodoId: raw.extendedProperties?.private?.baseplusTodoId,
  };
  if (raw.start?.date && raw.end?.date) {
    return { ...base, allDay: true, startDate: raw.start.date, endDate: raw.end.date, start: combine(raw.start.date, "00:00"), end: combine(raw.end.date, "00:00") };
  }
  if (raw.start?.dateTime && raw.end?.dateTime) {
    return { ...base, allDay: false, start: toISO(new Date(raw.start.dateTime)), end: toISO(new Date(raw.end.dateTime)) };
  }
  // 削除済みの回などは日時が入っていないことがある
  if (status === "cancelled") return { ...base, allDay: false, start: "", end: "" };
  return null;
}

/**
 * 指定期間の予定を読み込む。繰り返し予定は1回ずつに展開（singleEvents）し、
 * 削除された回も「cancelled」として受け取る（showDeleted）ことで、変更・削除を検知できるようにする。
 */
export async function listEvents(token: AccessToken, calendarId: string, from: DateKey, to: DateKey): Promise<GCalEvent[]> {
  const out: GCalEvent[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({
      timeMin: combine(from, "00:00"),
      timeMax: combine(to, "00:00"),
      singleEvents: "true",
      showDeleted: "true",
      orderBy: "startTime",
      timeZone: "Asia/Tokyo",
      maxResults: "250",
      ...(pageToken ? { pageToken } : {}),
    });
    const r = await api<{ items?: RawEvent[]; nextPageToken?: string }>(token, `/calendars/${encodeURIComponent(calendarId)}/events?${q}`);
    for (const e of r.items ?? []) {
      const n = normalizeEvent(e, calendarId);
      if (n) out.push(n);
    }
    pageToken = r.nextPageToken;
  } while (pageToken);
  return out;
}

/**
 * 予定を1件だけ取得する（読み込み期間の外へ移動された予定かどうかを確かめるため）。
 * 見つからない（404/410）場合は null。それ以外のエラーはそのまま伝える（誤って削除扱いにしないため）。
 */
export async function getEvent(token: AccessToken, calendarId: string, eventId: string): Promise<GCalEvent | null> {
  try {
    const raw = await api<RawEvent>(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?timeZone=Asia%2FTokyo`);
    return normalizeEvent(raw, calendarId);
  } catch (err) {
    if (err instanceof GoogleApiError && err.kind === "notfound") return null;
    throw err;
  }
}

export interface WorkEventInput {
  eventId: string;
  todoId: string;
  title: string;
  description: string;
  start: ISODateTime;
  end: ISODateTime;
}

function workEventBody(e: WorkEventInput, status = "confirmed") {
  return {
    id: e.eventId,
    status,
    summary: e.title,
    description: e.description,
    start: { dateTime: e.start, timeZone: "Asia/Tokyo" },
    end: { dateTime: e.end, timeZone: "Asia/Tokyo" },
    extendedProperties: { private: { baseplusTodoId: e.todoId } },
    reminders: { useDefault: false },
  };
}

/**
 * 作業予定を登録する。予定IDはアプリが決めるため、通信失敗後に再試行しても二重に登録されない
 * （同じIDが既にあれば 409 になり、その予定を更新する）。
 */
export async function upsertWorkEvent(token: AccessToken, calendarId: string, e: WorkEventInput): Promise<"created" | "updated"> {
  const cal = encodeURIComponent(calendarId);
  try {
    await api(token, `/calendars/${cal}/events`, { method: "POST", body: JSON.stringify(workEventBody(e)) });
    return "created";
  } catch (err) {
    if (!(err instanceof GoogleApiError && err.kind === "conflict")) throw err;
  }
  // 既に同じIDの予定がある（前回の再試行・一度削除した予定など）→ 内容を上書きして有効にする
  await api(token, `/calendars/${cal}/events/${encodeURIComponent(e.eventId)}`, { method: "PUT", body: JSON.stringify(workEventBody(e)) });
  return "updated";
}

export async function deleteWorkEvent(token: AccessToken, calendarId: string, eventId: string): Promise<void> {
  try {
    await api(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
  } catch (err) {
    if (err instanceof GoogleApiError && err.kind === "notfound") return; // すでに削除済み
    throw err;
  }
}

/** ToDoごとに決まった予定ID（Googleの予定IDに使える文字：0-9 と a-v） */
export function eventIdForTodo(todoId: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < todoId.length; i++) {
    const c = todoId.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return `bp${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}
