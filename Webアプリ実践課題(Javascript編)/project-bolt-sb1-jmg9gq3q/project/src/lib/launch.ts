/**
 * LINE のリンクなどから開いたときの「最初に見せる画面」。
 *   ?open=today        … 今日のカレンダー
 *   ?open=sales-day    … 今日の売上（sales-week = 今週、sales-month = 今月）
 * ログインをはさんでも使えるように、最初に開いたときに覚えて、アドレスからは消しておく。
 */
export type LaunchIntent = 'today' | 'sales-day' | 'sales-week' | 'sales-month';

const KEY = 'todo.launch';
const VALID: LaunchIntent[] = ['today', 'sales-day', 'sales-week', 'sales-month'];

/** アプリを読み込んだ直後に1回だけ呼ぶ */
export function rememberLaunchIntent() {
  const url = new URL(window.location.href);
  const open = url.searchParams.get('open');
  if (open === null && !url.searchParams.has('openExternalBrowser')) return;
  if (open && (VALID as string[]).includes(open)) sessionStorage.setItem(KEY, open);
  url.searchParams.delete('open');
  // LINE で「いつものブラウザで開く」ための印。役目を終えたので消す
  url.searchParams.delete('openExternalBrowser');
  window.history.replaceState(window.history.state, '', url.toString());
}

let taken: LaunchIntent | null | undefined;

/** 覚えておいた画面を1回だけ受け取る（開発中に2回呼ばれても同じ答えを返す） */
export function takeLaunchIntent(): LaunchIntent | null {
  if (taken === undefined) {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    taken = v && (VALID as string[]).includes(v) ? (v as LaunchIntent) : null;
  }
  return taken;
}
