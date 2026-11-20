// =============================================================
// 玄関口：LINEからの通知を受け取るURL
//   公開後のURL → https://（あなたのプロジェクト名）.vercel.app/api/webhook
//   このURLを LINE Developers の「Webhook URL」に登録します。
// =============================================================
import { waitUntil } from "@vercel/functions";
import { verifySignature } from "./_lib/line.js";
import { handleWebhookBody } from "./_lib/handler.js";

// ブラウザでURLを開いたとき用（動いているかの確認）
export function GET() {
  return new Response("Dify × LINE ボットは動いています 🟢", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

// LINEからの通知はここに届く
export async function POST(request) {
  // 署名チェックには「加工前の生データ」が必要なので text() で受け取る
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");

  if (!verifySignature(rawBody, signature, process.env.LINE_CHANNEL_SECRET)) {
    console.warn("署名が一致しません（LINE以外からのアクセス、またはシークレットの設定ミス）");
    return new Response("Invalid signature", { status: 401 });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // LINEには「受け取ったよ」とすぐ返事（200）をして、
  // Difyへの問い合わせ〜返信は裏側で続ける（waitUntil）。
  // こうしないとAIの回答待ちの間にLINE側が待ちくたびれてしまいます。
  waitUntil(handleWebhookBody(body));
  return new Response("OK", { status: 200 });
}
