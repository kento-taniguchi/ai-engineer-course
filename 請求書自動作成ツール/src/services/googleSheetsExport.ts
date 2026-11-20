// Google スプレッドシートへの保存（ブラウザから直接 Google に送ります）
// - ログインと許可は Google Identity Services（Google 公式の部品）で行います
// - 許可の範囲は drive.file：「このアプリが作ったファイルだけ」を読み書きできる、いちばん狭い権限です
// - 受け取った通行証（アクセストークン）はメモリの中だけに置き、保存しません
// ※ ブラウザの画面（集計画面）からだけ使います

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
      reject(new Error("Google のログイン部品を読み込めませんでした。インターネット接続を確認してください。"));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

let token: { value: string; expiresAt: number } | null = null;

/** 通行証（アクセストークン）を受け取る。有効なものがあれば使い回す */
function getAccessToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt - 60_000) return Promise.resolve(token.value);
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) return Promise.reject(new Error("Google のログイン部品の準備ができていません。少し待ってからもう一度押してください。"));
  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) {
          reject(new Error(r.error === "access_denied" ? "Google での許可が取り消されました。" : `Google の許可を受け取れませんでした（${r.error_description ?? r.error ?? "不明"}）`));
          return;
        }
        token = { value: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 };
        resolve(r.access_token);
      },
      error_callback: (e) => {
        const msg =
          e.type === "popup_closed" ? "Google のログイン画面が閉じられました。" :
          e.type === "popup_failed_to_open" ? "Google のログイン画面を開けませんでした（ポップアップがブロックされていないか確認してください）。" :
          `Google にログインできませんでした（${e.message ?? e.type ?? "不明"}）`;
        reject(new Error(msg));
      },
    });
    client.requestAccessToken();
  });
}

/** Google から返ってきたエラーを、わかる言葉にする */
async function explainError(res: Response): Promise<string> {
  let detail = "";
  try {
    const j = await res.json();
    detail = j?.error?.message ?? "";
  } catch {
    /* 本文なし */
  }
  if (res.status === 401) return "Google のログインの有効期限が切れました。もう一度押してください。";
  if (res.status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(detail))
    return "Google Cloud で「Google Sheets API」が有効になっていません（README の手順を確認してください）。";
  if (res.status === 403) return `Google から許可されませんでした（${detail || "403"}）`;
  return `スプレッドシートを作れませんでした（${res.status} ${detail}）`;
}

/**
 * スプレッドシートを新しく作る（あなたの Google ドライブの「マイドライブ」にできます）。
 * 戻り値はスプレッドシートの URL。
 */
export async function createSpreadsheet(request: object): Promise<string> {
  if (!isGoogleConfigured()) throw new Error("Google 連携の設定（クライアントID）がまだありません。");
  const accessToken = await getAccessToken();
  const res = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    if (res.status === 401) token = null;
    throw new Error(await explainError(res));
  }
  const data = (await res.json()) as { spreadsheetUrl?: string };
  if (!data.spreadsheetUrl) throw new Error("スプレッドシートはできましたが、URLを受け取れませんでした。Google ドライブを確認してください。");
  return data.spreadsheetUrl;
}
