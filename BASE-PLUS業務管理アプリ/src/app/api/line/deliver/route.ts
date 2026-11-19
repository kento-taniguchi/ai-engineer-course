// プチセミナーの一斉送信
//  GET  … Vercelの定期実行（1日1回）から呼ばれる。今日が配信日でURLのある回を送る。CRON_SECRET で確認
//  POST … アプリの「今すぐ申込者に送る」から呼ばれる。ログイン中の本人だけ。{ episodeId } の回を送る

import { episodesToDeliver } from "@/lib/lineLogic";
import { dateKey } from "@/lib/time";
import { deliverEpisode } from "@/server/delivery";
import { lineConfigured } from "@/server/line";
import { adminConfigured, loadSeminars, requireOwner } from "@/server/supabaseAdmin";

function notReady(): Response | null {
  const l = lineConfigured();
  if (!l.token || !adminConfigured()) return Response.json({ ok: false, message: "サーバーの設定（LINE・Supabaseの鍵）が不足しています" }, { status: 503 });
  return null;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  const nr = notReady();
  if (nr) return nr;
  try {
    const today = dateKey(new Date());
    const targets = episodesToDeliver(await loadSeminars(), today);
    const results = [];
    for (const ep of targets) results.push(await deliverEpisode(ep, "cron"));
    // 識別番号・文面は出さず、件数と結果だけ記録
    console.log("[line-deliver] cron", today, JSON.stringify(results.map((r) => ({ id: r.episodeId, status: r.status }))));
    return Response.json({ ok: true, date: today, results });
  } catch (e) {
    console.error("[line-deliver] cron 失敗:", e instanceof Error ? e.message : "不明なエラー");
    return Response.json({ ok: false }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const nr = notReady();
  if (nr) return nr;
  const owner = await requireOwner(req);
  if (!owner.ok) return Response.json({ ok: false, message: owner.message }, { status: owner.status });
  let episodeId = "";
  try {
    episodeId = String(((await req.json()) as { episodeId?: string }).episodeId ?? "");
  } catch {
    /* 下で確認 */
  }
  if (!episodeId) return Response.json({ ok: false, message: "送る回が指定されていません" }, { status: 400 });
  try {
    const ep = (await loadSeminars()).find((s) => s.id === episodeId);
    if (!ep) return Response.json({ ok: false, message: "この回がクラウドに見つかりません（自動同期が終わってから、もう一度お試しください）" }, { status: 404 });
    const r = await deliverEpisode(ep, "manual");
    return Response.json({ ok: r.status === "sent", result: r });
  } catch (e) {
    return Response.json({ ok: false, message: e instanceof Error ? e.message : "送信に失敗しました" }, { status: 500 });
  }
}
