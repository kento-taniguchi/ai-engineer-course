// =============================================================
// LINE とやりとりする係
//   - 届いた通知が「本物のLINEから」か確かめる（署名チェック）
//   - ユーザーに返信する
//   - 「考え中…」のアニメーションを出す
// =============================================================
import crypto from "node:crypto";

const LINE_API = "https://api.line.me/v2/bot";

// LINEの1吹き出しに入る最大文字数（公式の上限は5000文字）
const MAX_TEXT_LENGTH = 5000;

/**
 * 署名チェック
 * LINEは通知を送るとき、「チャネルシークレット（合言葉）」を使って作った
 * 暗号のハンコ（x-line-signature）を付けてきます。
 * こちらでも同じ合言葉でハンコを作り、一致すれば本物のLINEからの通知です。
 * → 第三者がなりすましてボットを勝手に動かすのを防ぎます。
 */
export function verifySignature(rawBody, signature, channelSecret) {
  if (!signature || !channelSecret) return false;
  const expected = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  // 長さが違えば不一致。timingSafeEqual は「比較にかかる時間」から
  // 答えを推測される攻撃を防ぐための比較方法です。
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** 長すぎる文章を、LINEに入る長さで切り分ける（最大5吹き出し） */
export function splitText(text) {
  const chunks = [];
  for (let i = 0; i < text.length && chunks.length < 5; i += MAX_TEXT_LENGTH) {
    chunks.push(text.slice(i, i + MAX_TEXT_LENGTH));
  }
  return chunks.length ? chunks : ["（回答が空でした）"];
}

async function callLineApi(path, body, accessToken) {
  const res = await fetch(`${LINE_API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`LINE API ${path} が失敗しました (${res.status}): ${detail}`);
  }
}

/**
 * 返信（リプライ）
 * 返信用の「整理券（replyToken）」を使って返します。無料で何通でも送れます。
 * ただし整理券には有効期限があるため、Difyの回答が遅すぎると使えなくなります。
 */
export async function replyText(replyToken, text, accessToken) {
  const messages = splitText(text).map((t) => ({ type: "text", text: t }));
  await callLineApi("/message/reply", { replyToken, messages }, accessToken);
}

/**
 * プッシュ送信（返信の予備手段）
 * 整理券が期限切れのときに使います。
 * ※無料プランでは月の送信数に上限があるので「予備」扱いにしています。
 */
export async function pushText(userId, text, accessToken) {
  const messages = splitText(text).map((t) => ({ type: "text", text: t }));
  await callLineApi("/message/push", { to: userId, messages }, accessToken);
}

/**
 * 「考え中…」のアニメーションをトーク画面に表示する
 * AIの回答には数秒かかるので、待っている間の安心感を出します。
 * （1対1のトークでのみ表示されます。失敗しても本体の動作には影響させません）
 */
export async function showLoading(userId, accessToken, seconds = 20) {
  try {
    await callLineApi(
      "/chat/loading/start",
      { chatId: userId, loadingSeconds: seconds },
      accessToken,
    );
  } catch (err) {
    console.warn("ローディング表示に失敗（動作には影響なし）:", err.message);
  }
}
