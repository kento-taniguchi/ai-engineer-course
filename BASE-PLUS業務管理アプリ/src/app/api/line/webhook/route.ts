// 公式LINEからの通知の受け口（Webhook）
//  - 署名を確認し、LINEから届いたものだけを処理する
//  - 「セミナー」→ 申込者として記録し、最新回のURLを返信（返信は無料・通数に数えない）
//  - 「配信停止」→ 一斉送信の対象から外す
//  - ブロック（unfollow）→ 対象から外す
//  - それ以外の文章には返信しない（公式アカウントのチャットで本人が対応できるように）
//  - 届いた文章・識別番号はログに出さない

import { classifyLineText, stopReply, subscribeReply } from "@/lib/lineLogic";
import { dateKey } from "@/lib/time";
import { lineConfigured, replyText, verifyLineSignature } from "@/server/line";
import { adminConfigured, loadSeminars, sbAdmin } from "@/server/supabaseAdmin";

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyLineSignature(raw, req.headers.get("x-line-signature"))) {
    return new Response("invalid signature", { status: 401 });
  }
  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(raw) as { events?: LineEvent[] }).events ?? [];
  } catch {
    return new Response("bad request", { status: 400 });
  }
  // LINE Developers の「検証」ボタンは空の通知を送ってくる
  if (events.length === 0) return Response.json({ ok: true });
  if (!lineConfigured().token || !adminConfigured()) {
    console.error("[line-webhook] 設定が不足しています（鍵が未登録）");
    return Response.json({ ok: false });
  }

  for (const ev of events) {
    try {
      await handle(ev);
    } catch (e) {
      // 1件の失敗で他の処理を止めない。内容・識別番号は出さない
      console.error("[line-webhook] 処理に失敗しました:", e instanceof Error ? e.message : "不明なエラー");
    }
  }
  // LINEには常に200を返す（返さないと再送が続く）
  return Response.json({ ok: true });
}

async function handle(ev: LineEvent) {
  const userId = ev.source?.type === "user" ? ev.source.userId : undefined;
  if (!userId) return; // グループ・トークルームは対象外
  const db = sbAdmin();
  const now = new Date().toISOString();

  if (ev.type === "unfollow") {
    await db.from("line_subscribers").update({ status: "blocked", status_changed_at: now }).eq("line_user_id", userId);
    return;
  }
  if (ev.type !== "message" || ev.message?.type !== "text" || !ev.replyToken) return;

  const intent = classifyLineText(ev.message.text ?? "");
  if (intent === "other") return;

  const { data: existing } = await db.from("line_subscribers").select("status").eq("line_user_id", userId).maybeSingle();

  if (intent === "stop") {
    if (existing) await db.from("line_subscribers").update({ status: "stopped", status_changed_at: now }).eq("line_user_id", userId);
    await replyText(ev.replyToken, stopReply());
    return;
  }

  // 申込：記録してから返信する（初めて・停止からの再開のときだけ案内文を付ける）
  const firstTime = !existing || existing.status !== "active";
  if (!existing) {
    await db.from("line_subscribers").insert({ line_user_id: userId, status: "active", subscribed_at: now, last_request_at: now, status_changed_at: now });
  } else {
    await db
      .from("line_subscribers")
      .update(existing.status === "active" ? { last_request_at: now } : { status: "active", last_request_at: now, status_changed_at: now })
      .eq("line_user_id", userId);
  }
  const seminars = await loadSeminars();
  await replyText(ev.replyToken, subscribeReply(seminars, dateKey(new Date()), firstTime));
}
