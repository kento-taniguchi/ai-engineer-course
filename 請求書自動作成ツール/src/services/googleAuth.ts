// Google へのログイン（通行証＝アクセストークンの受け取り）と、Google への依頼の送信
// - ログインと許可は Google Identity Services（Google 公式の部品）で行います
// - 許可の範囲は drive.file：「このアプリが作ったファイルだけ」を読み書きできる、いちばん狭い権限です
// - 通行証はメモリの中だけに置き、保存しません（約1時間で切れます）
// ※ ブラウザの画面からだけ使います

/** Google Cloud で作った「OAuth クライアントID」（.env.local の NEXT_PUBLIC_GOOGLE_CLIENT_ID） */
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
export const isGoogleConfigured = () => GOOGLE_CLIENT_ID.trim() !== "";

const GIS_SRC = "https://accounts.google.com/gsi/client";
const SCOPE = "https://www.googleapis.com/auth/drive.file";

type TokenResponse = { access_token?: string; expires_in?: number; error?: string; error_description?: string };
type TokenClient = { requestAccessToken: (overrides?: { prompt?: string }) => void };
type GoogleOAuth2 = {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type?: string; message?: string }) => void;
  }) => TokenClient;
};
declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

/** Google の接続でうまくいかなかったとき（画面にそのまま出せる文章） */
export class GoogleError extends Error {
  /** true のときは「再接続」ボタンを押せば直る（許可の期限切れなど） */
  constructor(message: string, readonly needsReconnect = false) {
    super(message);
  }
}

// ---- ログイン部品の読み込み ----

let gisLoading: Promise<void> | null = null;

/** Google のログイン用の部品を読み込む（画面を開いたときに先に読んでおく） */
export function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoading) return gisLoading;
  gisLoading = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisLoading = null;
      reject(new GoogleError("Google のログイン部品を読み込めませんでした。インターネット接続を確認してください。"));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

// ---- 通行証（アクセストークン） ----

let token: { value: string; expiresAt: number } | null = null;
let everConnected = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

/** 接続の状態が変わったら知らせてもらう（戻り値を呼ぶと解除） */
export function onAuthChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** 今、有効な通行証があるか（期限の1分前からは「ない」扱い） */
export const hasValidToken = () => !!token && Date.now() < token.expiresAt - 60_000;
/** 一度でも接続できたか（「ログイン」と「再接続」の表示の切り替えに使う） */
export const wasConnected = () => everConnected;

/** 通行証を捨てる（期限切れ・取り消しのとき） */
export function dropToken() {
  if (!token) return;
  token = null;
  notify();
}

/**
 * Google のログイン画面を出して通行証を受け取る。
 * ※ ボタンを押したときの処理の中で、待たずにすぐ呼んでください（ポップアップがブロックされないように）
 */
export function signIn(): Promise<void> {
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) return Promise.reject(new GoogleError("Google のログイン部品の準備ができていません。少し待ってからもう一度押してください。"));
  return new Promise<void>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) {
          reject(new GoogleError(r.error === "access_denied" ? "Google での許可が取り消されました。" : `Google の許可を受け取れませんでした（${r.error_description ?? r.error ?? "不明"}）`));
          return;
        }
        token = { value: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 };
        everConnected = true;
        notify();
        resolve();
      },
      error_callback: (e) => {
        const msg =
          e.type === "popup_closed" ? "Google のログイン画面が閉じられました。" :
          e.type === "popup_failed_to_open" ? "Google のログイン画面を開けませんでした（ポップアップがブロックされていないか確認してください）。" :
          `Google にログインできませんでした（${e.message ?? e.type ?? "不明"}）`;
        reject(new GoogleError(msg));
      },
    });
    client.requestAccessToken(everConnected ? { prompt: "" } : undefined);
  });
}

// ---- Google への依頼 ----

/** Google から返ってきたエラーを、わかる言葉にする */
async function explainError(res: Response): Promise<GoogleError> {
  let detail = "";
  try {
    const j = await res.json();
    detail = j?.error?.message ?? "";
  } catch {
    /* 本文なし */
  }
  if (res.status === 401) return new GoogleError("Google の接続の有効期限が切れました。画面上の「再接続」を押してください。", true);
  if (res.status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(detail))
    return new GoogleError("Google Cloud で「Google Sheets API」が有効になっていません（README の手順を確認してください）。");
  if (res.status === 403 || res.status === 404)
    return new GoogleError(`データのスプレッドシートを開けませんでした。削除されたか、このアプリで作ったものではない可能性があります（${res.status} ${detail}）`);
  if (res.status === 429) return new GoogleError("Google への依頼が多すぎました。1分ほど待ってからもう一度お試しください。");
  return new GoogleError(`Google との通信でエラーが起きました（${res.status} ${detail}）`);
}

/** 通行証を付けて Google に依頼を送り、返ってきた JSON を返す */
export async function googleFetch<T = unknown>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!isGoogleConfigured()) throw new GoogleError("Google 連携の設定（クライアントID）がまだありません。");
  if (!hasValidToken()) {
    dropToken();
    throw new GoogleError("Google の接続の有効期限が切れました。画面上の「再接続」を押してください。", true);
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token!.value}`,
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new GoogleError("Google につながりませんでした。インターネット接続を確認してください。");
  }
  if (!res.ok) {
    const err = await explainError(res);
    if (err.needsReconnect) dropToken();
    throw err;
  }
  return (await res.json()) as T;
}
