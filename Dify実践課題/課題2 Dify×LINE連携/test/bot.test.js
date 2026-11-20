// 本物のLINE・Difyの代わりに「偽物」を用意して、流れが正しいかを確かめるテスト
// 実行方法：npm test
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.LINE_CHANNEL_SECRET = "test-secret";
process.env.LINE_CHANNEL_ACCESS_TOKEN = "test-token";
process.env.DIFY_API_KEY = "app-test";

const { verifySignature, splitText } = await import("../api/_lib/line.js");
const { toLineText } = await import("../api/_lib/dify.js");
const { handleWebhookBody } = await import("../api/_lib/handler.js");
const { POST, GET } = await import("../api/webhook.js");

// ---- 偽物のインターネット（fetch）。送られた内容を記録して、決まった答えを返す ----
let calls = [];
let difyAnswer = "**料金**は7,000円です。";
let failReply = false;
beforeEach(() => {
  calls = [];
  difyAnswer = "**料金**は7,000円です。";
  failReply = false;
  globalThis.fetch = async (url, opts = {}) => {
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ url: String(url), method: opts.method ?? "GET", body });
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
    if (String(url).includes("/conversations?")) return json({ data: [{ id: "conv-123" }] });
    if (String(url).endsWith("/chat-messages")) return json({ answer: difyAnswer, conversation_id: "conv-123" });
    if (String(url).endsWith("/message/reply") && failReply) return json({ message: "Invalid reply token" }, 400);
    return json({});
  };
});

const sign = (raw) => crypto.createHmac("sha256", "test-secret").update(raw).digest("base64");
const textEvent = (text) => ({
  type: "message",
  replyToken: "rt-1",
  source: { type: "user", userId: "U001" },
  message: { type: "text", text },
});

test("正しい署名は通り、間違った署名は弾く", () => {
  const raw = '{"events":[]}';
  assert.equal(verifySignature(raw, sign(raw), "test-secret"), true);
  assert.equal(verifySignature(raw, "wrong", "test-secret"), false);
  assert.equal(verifySignature(raw, undefined, "test-secret"), false);
});

test("Webhook：署名なしは401、LINEの接続確認（空イベント）は200", async () => {
  const raw = '{"destination":"x","events":[]}';
  const bad = await POST(new Request("http://x/api/webhook", { method: "POST", body: raw }));
  assert.equal(bad.status, 401);
  const ok = await POST(
    new Request("http://x/api/webhook", {
      method: "POST",
      body: raw,
      headers: { "x-line-signature": sign(raw) },
    }),
  );
  assert.equal(ok.status, 200);
  assert.equal((await GET()).status, 200);
});

test("質問 → Difyに前回の会話IDつきで質問 → 整えた回答をLINEに返信", async () => {
  await handleWebhookBody({ events: [textEvent("料金はいくら？")] });

  const dify = calls.find((c) => c.url.endsWith("/chat-messages"));
  assert.equal(dify.body.query, "料金はいくら？");
  assert.equal(dify.body.user, "line-U001");
  assert.equal(dify.body.conversation_id, "conv-123");

  assert.ok(calls.some((c) => c.url.endsWith("/chat/loading/start")));
  const reply = calls.find((c) => c.url.endsWith("/message/reply"));
  assert.equal(reply.body.replyToken, "rt-1");
  assert.equal(reply.body.messages[0].text, "料金は7,000円です。");
});

test("返信の整理券が使えないときはプッシュ送信で届ける", async () => {
  failReply = true;
  await handleWebhookBody({ events: [textEvent("こんにちは")] });
  const push = calls.find((c) => c.url.endsWith("/message/push"));
  assert.equal(push.body.to, "U001");
});

test("友だち追加であいさつ、スタンプには案内を返す（Difyは呼ばない）", async () => {
  await handleWebhookBody({
    events: [
      { type: "follow", replyToken: "rt-f", source: { type: "user", userId: "U001" } },
      { type: "message", replyToken: "rt-s", source: { type: "user", userId: "U001" }, message: { type: "sticker" } },
    ],
  });
  const replies = calls.filter((c) => c.url.endsWith("/message/reply"));
  assert.equal(replies.length, 2);
  assert.ok(!calls.some((c) => c.url.endsWith("/chat-messages")));
});

test("「リセット」で新しい会話を始める", async () => {
  await handleWebhookBody({ events: [textEvent("リセット")] });
  const dify = calls.find((c) => c.url.endsWith("/chat-messages"));
  assert.equal(dify.body.conversation_id, "");
  const reply = calls.find((c) => c.url.endsWith("/message/reply"));
  assert.match(reply.body.messages[0].text, /リセット/);
});

test("マークダウン記号の除去と、長文の分割", () => {
  assert.equal(toLineText("### 料金\n- 対面：7,000円\n**おすすめ**"), "料金\n・対面：7,000円\nおすすめ");
  assert.equal(splitText("あ".repeat(12000)).length, 3);
});
