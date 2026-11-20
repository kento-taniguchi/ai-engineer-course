// =============================================================
// 司令塔：LINEから届いた1件1件の出来事（イベント）を処理する
// =============================================================
import { replyText, pushText, showLoading } from "./line.js";
import { askDify, findLatestConversationId, toLineText } from "./dify.js";

// この言葉が送られたら、会話の記憶をリセットして新しい話題として始める
const RESET_WORDS = ["リセット", "最初から", "reset"];

const WELCOME_TEXT =
  "ひだまり珈琲店です。友だち追加ありがとうございます！\n" +
  "営業時間・メニュー・ご予約など、気になることをメッセージで送ってください。AIスタッフがお答えします。\n" +
  "（話題を変えたいときは「リセット」と送ってください）";

const ERROR_TEXT =
  "申し訳ありません。ただいま回答できませんでした。\n" +
  "少し時間をおいて、もう一度お送りください。";

function getConfig() {
  const config = {
    accessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    difyApiKey: process.env.DIFY_API_KEY,
  };
  if (!config.accessToken || !config.difyApiKey) {
    throw new Error(
      "環境変数 LINE_CHANNEL_ACCESS_TOKEN / DIFY_API_KEY が設定されていません",
    );
  }
  return config;
}

/** 返信を試し、整理券が期限切れなどで失敗したらプッシュ送信で届ける */
async function deliver(event, text, accessToken) {
  try {
    await replyText(event.replyToken, text, accessToken);
  } catch (err) {
    console.warn("返信に失敗したのでプッシュ送信に切り替えます:", err.message);
    const userId = event.source?.userId;
    if (userId) await pushText(userId, text, accessToken);
  }
}

/** イベント1件を処理する */
export async function handleEvent(event) {
  const { accessToken, difyApiKey } = getConfig();

  // ① 友だち追加されたとき → あいさつ
  if (event.type === "follow") {
    await replyText(event.replyToken, WELCOME_TEXT, accessToken);
    return;
  }

  // ② 文字のメッセージ以外（スタンプ・画像など）→ 案内だけ返す
  if (event.type !== "message") return;
  if (event.message?.type !== "text") {
    await replyText(
      event.replyToken,
      "申し訳ありません。文字のメッセージでご質問ください。",
      accessToken,
    );
    return;
  }

  const userId = event.source?.userId ?? "unknown";
  const text = event.message.text.trim();
  // Difyの「ログ」画面でLINEからの会話だと分かるよう、頭に line- を付ける
  const difyUser = `line-${userId}`;

  // ③ リセットの合言葉 → 新しい会話を始める
  if (RESET_WORDS.includes(text.toLowerCase())) {
    // 次の質問で conversation_id を空にするため、目印として Dify に新しい会話を作る
    await askDify({ query: "（会話をリセットしました）", user: difyUser, apiKey: difyApiKey });
    await replyText(
      event.replyToken,
      "会話をリセットしました。新しいご質問をどうぞ。",
      accessToken,
    );
    return;
  }

  // ④ 通常の質問 → 「考え中…」を出して、Difyに聞いて、返信する
  if (event.source?.type === "user") await showLoading(userId, accessToken);
  try {
    const conversationId = await findLatestConversationId(difyUser, difyApiKey);
    const { answer } = await askDify({
      query: text,
      user: difyUser,
      conversationId,
      apiKey: difyApiKey,
    });
    await deliver(event, toLineText(answer), accessToken);
  } catch (err) {
    console.error("回答の作成に失敗:", err);
    await deliver(event, ERROR_TEXT, accessToken);
  }
}

/** LINEから届いた通知（複数のイベントが入っていることがある）をまとめて処理 */
export async function handleWebhookBody(body) {
  const events = Array.isArray(body?.events) ? body.events : [];
  // 1件の失敗が他のイベントを巻き込まないよう、allSettled で全部処理する
  const results = await Promise.allSettled(events.map(handleEvent));
  for (const r of results) {
    if (r.status === "rejected") console.error("イベント処理エラー:", r.reason);
  }
}
