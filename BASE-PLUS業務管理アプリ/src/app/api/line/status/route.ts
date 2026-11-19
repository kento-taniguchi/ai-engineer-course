// 公式LINEの連携状況（ログイン中の本人だけ）：設定の有無・申込者の人数・今月の通数・配信の記録
// 申込者の識別番号は返さない

import { getConsumption, getQuota, lineConfigured, lineKeyProblems } from "@/server/line";
import { adminConfigured, requireOwner, sbAdmin } from "@/server/supabaseAdmin";

export async function GET(req: Request) {
  const l = lineConfigured();
  const configured = { lineSecret: l.secret, lineToken: l.token, supabase: adminConfigured(), cron: !!process.env.CRON_SECRET };
  if (!configured.supabase) return Response.json({ ok: true, configured });
  const owner = await requireOwner(req);
  if (!owner.ok) return Response.json({ ok: false, message: owner.message }, { status: owner.status });

  const db = sbAdmin();
  const [subs, deliveries] = await Promise.all([
    db.from("line_subscribers").select("status"),
    db.from("line_deliveries").select("episode_id, status, trigger, started_at, finished_at, recipients, error").order("started_at", { ascending: false }).limit(50),
  ]);
  const counts = { active: 0, stopped: 0, blocked: 0 };
  for (const r of subs.data ?? []) counts[r.status as keyof typeof counts]++;

  let quota: { type: "none" | "limited"; value?: number } | null = null;
  let used: number | null = null;
  let lineError: string | null = null;
  if (l.token) {
    try {
      [quota, used] = await Promise.all([getQuota(), getConsumption()]);
    } catch (e) {
      lineError = e instanceof Error ? e.message : "LINEに接続できませんでした";
    }
  }
  return Response.json({
    ok: true,
    configured,
    keyProblems: lineKeyProblems(),
    tablesReady: !subs.error && !deliveries.error,
    subscribers: counts,
    quota,
    used,
    lineError,
    deliveries: deliveries.data ?? [],
  });
}
