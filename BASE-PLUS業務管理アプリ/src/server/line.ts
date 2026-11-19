// LINE Messaging API（サーバー専用。秘密の鍵を使うため、画面側のコードから読み込まないこと）
//
// 使う環境変数（Vercelの画面で登録。値はログ・画面に出さない）
//   LINE_CHANNEL_SECRET        … 届いた通知が本当にLINEからのものかを確かめる（署名の確認）
//   LINE_CHANNEL_ACCESS_TOKEN  … 返信・送信に使う

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.line.me/v2/bot";

export function lineConfigured(): { secret: boolean; token: boolean } {
  return { secret: !!process.env.LINE_CHANNEL_SECRET, token: !!process.env.LINE_CHANNEL_ACCESS_TOKEN };
}

/**
 * 登録された鍵の「形」を確かめる（値そのものは返さない）。
 * チャネルシークレットは英数字32文字、チャネルアクセストークンは英数字と記号だけの長い文字列。
 * 見出しの日本語を一緒にコピーした・空白が混ざった、などの登録ミスを見つけるため。
 */
export function lineKeyProblems(): string[] {
  const out: string[] = [];
  const secret = process.env.LINE_CHANNEL_SECRET ?? "";
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
  if (secret && !/^[0-9a-f]{32}$/i.test(secret.trim())) out.push("LINE_CHANNEL_SECRET の形が正しくありません（英数字32文字のはずです。見出しの文字や空白が入っていないか確認してください）");
  if (token && (!/^[A-Za-z0-9+/=._-]+$/.test(token.trim()) || token.trim().length < 100))
    out.push("LINE_CHANNEL_ACCESS_TOKEN の形が正しくありません（英数字と記号だけの長い文字列のはずです。日本語の見出しなどが一緒にコピーされていないか確認してください）");
  return out;
}

/** 署名（X-Line-Signature）を確認する。本文は受け取ったままの文字列で計算する */
export function verifyLineSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET?.trim();
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature, "base64");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export class LineApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (!token) throw new LineApiError(0, "LINEの鍵（チャネルアクセストークン）が設定されていません");
  if (!/^[\x21-\x7e]+$/.test(token)) throw new LineApiError(0, "LINEの鍵（チャネルアクセストークン）に英数字以外の文字（日本語など）が含まれています。Vercelで登録し直してください");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (res.ok) {
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  }
  // 409 は「同じ再送キーで送信済み」＝二重送信を防げたので成功とみなす
  if (res.status === 409 && init.headers && "X-Line-Retry-Key" in (init.headers as Record<string, string>)) return {} as T;
  let reason = "";
  try {
    reason = ((await res.json()) as { message?: string }).message ?? "";
  } catch {
    /* 本文なし */
  }
  const msg =
    res.status === 401
      ? "LINEの鍵（チャネルアクセストークン）が正しくないか、無効になっています"
      : res.status === 429
        ? "LINEの送信回数の上限、または今月の通数の上限に達しました"
        : `LINEでエラーが発生しました（${res.status}${reason ? `：${reason}` : ""}）`;
  throw new LineApiError(res.status, msg);
}

export async function replyText(replyToken: string, text: string): Promise<void> {
  await call("/message/reply", { method: "POST", body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }) });
}

/**
 * 複数の人に送る（最大500人）。retryKey を付けると、同じキーでの再送はLINE側で二重送信にならない（24時間）。
 */
export async function multicastText(userIds: string[], text: string, retryKey: string): Promise<void> {
  await call("/message/multicast", {
    method: "POST",
    headers: { "X-Line-Retry-Key": retryKey },
    body: JSON.stringify({ to: userIds, messages: [{ type: "text", text }] }),
  });
}

/** 今月の上限（type=none は上限なし） */
export async function getQuota(): Promise<{ type: "none" | "limited"; value?: number }> {
  return call("/message/quota");
}

/** 今月使った通数 */
export async function getConsumption(): Promise<number> {
  const r = await call<{ totalUsage?: number }>("/message/quota/consumption");
  return r.totalUsage ?? 0;
}

/** 回と何番目のまとまりかから決まる再送キー（UUIDの形） */
export function retryKeyFor(episodeId: string, index: number): string {
  const h = createHash("sha256").update(`baseplus:${episodeId}:${index}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
