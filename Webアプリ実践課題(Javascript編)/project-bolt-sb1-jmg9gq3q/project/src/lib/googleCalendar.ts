import type { Session } from '@supabase/supabase-js';
import { supabase, type NewTodo, type TaskTemplate, type Todo } from '@/lib/supabase';
import { CUSTOMER_TOKEN, hasCustomerToken } from '@/lib/customer';
import { redirectUrl } from '@/lib/auth';

/**
 * Google カレンダーの予定を読むためのしくみ。
 *
 * 1. 「Google で許可する」を押す → Google の画面で「カレンダーを見てよいか」を許可する
 * 2. アプリに戻ると、Google から「通行証（アクセストークン）」が届く（1時間だけ使える）
 * 3. 通行証で予定を読み、タスクとして取り込む
 *
 * 通行証はこのブラウザのタブの中だけに置き、データベースや GitHub には保存しない。
 */

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const API = 'https://www.googleapis.com/calendar/v3';
const TOKEN_KEY = 'todo.gcal.token';
const PENDING_KEY = 'todo.gcal.pending';

/** Google の画面へ移って、カレンダーを見る許可をもらう */
export async function requestCalendarAccess() {
  sessionStorage.setItem(PENDING_KEY, '1');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { scopes: SCOPE, redirectTo: redirectUrl() },
  });
  if (error) {
    sessionStorage.removeItem(PENDING_KEY);
    throw error;
  }
}

/** 許可して戻ってきたとき、届いた通行証を受け取る（ログインの入口で呼ぶ） */
export function captureCalendarToken(session: Session | null) {
  if (!session?.provider_token || !sessionStorage.getItem(PENDING_KEY)) return;
  // 通行証は1時間で切れるので、少し早めの55分を期限にする
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token: session.provider_token, expires: Date.now() + 55 * 60_000 }));
}

let justConnected: boolean | undefined;

/** 許可から戻ってきたばかりなら true。取り込みの画面を自動で開くのに使う（開発中に2回呼ばれても同じ答え） */
export function takeJustConnected() {
  if (justConnected === undefined) {
    justConnected = !!sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
  }
  return justConnected;
}

export function getCalendarToken(): string | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null') as { token: string; expires: number } | null;
    if (saved && saved.expires > Date.now()) return saved.token;
  } catch {
    // 壊れていたら無いものとする
  }
  sessionStorage.removeItem(TOKEN_KEY);
  return null;
}

export function forgetCalendarToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

/** 通行証が切れた・許可が足りないなど、もう一度 Google で許可すれば直るエラー */
export class CalendarAuthError extends Error {}

async function call<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.ok) return (await res.json()) as T;
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  const msg = body?.error?.message ?? '';
  if (res.status === 401) {
    forgetCalendarToken();
    throw new CalendarAuthError('Google の許可の期限が切れました。もう一度「Google で許可する」を押してください。');
  }
  if (res.status === 403 && /has not been used|is disabled|accessNotConfigured/i.test(msg)) {
    throw new Error('Google Cloud で「Google Calendar API」がまだ有効になっていません。有効にしてから、数分待ってもう一度お試しください。');
  }
  if (res.status === 403) {
    forgetCalendarToken();
    throw new CalendarAuthError('カレンダーを見る許可がありません。もう一度「Google で許可する」を押し、カレンダーの項目にチェックを入れてください。');
  }
  throw new Error(`Google カレンダーを読めませんでした（${res.status}）${msg ? `：${msg}` : ''}`);
}

export interface GoogleCalendar {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string;
}

export async function listCalendars(token: string) {
  const data = await call<{ items?: GoogleCalendar[] }>(token, '/users/me/calendarList?minAccessRole=reader');
  const items = data.items ?? [];
  // 自分のカレンダー（メイン）を先頭に
  return [...items].sort((a, b) => Number(!!b.primary) - Number(!!a.primary));
}

interface EventTime {
  dateTime?: string;
  date?: string;
}

export interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  updated: string;
  start: EventTime;
  end: EventTime;
}

/** 期間内の予定を全部読む（繰り返しの予定も1回ずつに分けて受け取る） */
export async function listEvents(token: string, calendarId: string, from: Date, to: Date) {
  const events: GoogleEvent[] = [];
  let pageToken = '';
  do {
    const q = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      maxResults: '250',
    });
    if (pageToken) q.set('pageToken', pageToken);
    const data = await call<{ items?: GoogleEvent[]; nextPageToken?: string }>(
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events?${q.toString()}`,
    );
    events.push(...(data.items ?? []));
    pageToken = data.nextPageToken ?? '';
  } while (pageToken);
  return events;
}

export const eventKey = (calendarId: string, eventId: string) => `${calendarId}:${eventId}`;

/** "2026-11-26" → その日の 0:00（日本の時刻で） */
const localDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Google の予定 → アプリのタスク。
 * 時刻のある予定はカレンダーの時間の枠へ、終日の予定はその日の旗の欄（期限 23:59）へ入れる。
 */
export function eventToTodo(ev: GoogleEvent, calendarId: string, category: string): NewTodo | null {
  const title = ev.summary?.trim() || '（タイトルなし）';
  const notes = [ev.location ? `場所：${ev.location}` : '', ev.description?.trim() ?? '', '（Googleカレンダーから取り込み）']
    .filter(Boolean)
    .join('\n');
  const base = { title, notes, category, google_event_id: eventKey(calendarId, ev.id), google_updated: ev.updated };

  if (ev.start.dateTime) {
    const start = new Date(ev.start.dateTime);
    const end = ev.end.dateTime ? new Date(ev.end.dateTime) : new Date(start.getTime() + 60 * 60_000);
    const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
    // 長すぎる予定は、カレンダーで見やすいよう24時間までにする
    return { ...base, scheduled_at: start.toISOString(), due_at: null, duration_minutes: Math.min(24 * 60, Math.max(15, minutes)) };
  }
  if (ev.start.date) {
    const due = localDate(ev.start.date);
    due.setHours(23, 59, 0, 0);
    return { ...base, scheduled_at: null, due_at: due.toISOString(), duration_minutes: 60 };
  }
  return null;
}

/** 取り込んだタスクの「日付」：実施日時、無ければ期限 */
export const importedDate = (t: Todo) => {
  const iso = t.scheduled_at ?? t.due_at;
  return iso ? new Date(iso) : null;
};

// ---- セットとして取り込む ------------------------------------------------------

/** セットごとの「予定の名前にこの言葉があればセットにする」設定 */
export interface SetRule {
  keyword: string;
  enabled: boolean;
}

/** 全角・半角、大文字・小文字の違いを無くして比べる */
const norm = (s: string) => s.normalize('NFKC').toLowerCase();
const words = (keyword: string) => norm(keyword).split(/\s+/).filter(Boolean);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 最初の目印の言葉：テンプレート名から {お客さん} を除いたもの（例：「BASE-PLUS 対面パーソナル」） */
export const defaultKeyword = (t: TaskTemplate) => t.name.split(CUSTOMER_TOKEN).join(' ').replace(/\s+/g, ' ').trim();

export interface SetMatch {
  template: TaskTemplate;
  /** 予定の名前から目印の言葉を除いた残り（お客さんの名前） */
  customer: string;
}

/**
 * 予定の名前に、どれかのセットの目印の言葉が全部入っていれば、そのセットを返す。
 * 例：目印「BASE-PLUS 対面パーソナル」、予定「山岸さん BASE-PLUS 対面パーソナル」→ お客さん「山岸さん」
 * いくつも当てはまるときは、目印の長いほう（より細かく決めたほう）を選ぶ。
 */
export function matchSet(title: string, rules: { template: TaskTemplate; rule: SetRule }[]): SetMatch | null {
  const text = norm(title);
  const hits = rules
    .filter(({ rule }) => rule.enabled && words(rule.keyword).length > 0 && words(rule.keyword).every((w) => text.includes(w)))
    .sort((a, b) => norm(b.rule.keyword).length - norm(a.rule.keyword).length);
  const hit = hits[0];
  if (!hit) return null;
  let rest = title.normalize('NFKC');
  for (const w of words(hit.rule.keyword)) rest = rest.replace(new RegExp(escapeRe(w), 'i'), ' ');
  const customer = hasCustomerToken(hit.template)
    ? rest.replace(/[\s・、,，/／|｜:：()（）【】[\]「」『』-]+/g, ' ').trim()
    : '';
  return { template: hit.template, customer };
}
