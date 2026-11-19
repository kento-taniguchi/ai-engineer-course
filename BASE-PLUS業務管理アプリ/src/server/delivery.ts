// プチセミナーの一斉送信（サーバー専用）
//  1. 回ごとに「送信中」を記録してから送る（送信済み・送信中の回は送らない＝二重送信しない）
//  2. 今月の残り通数が足りなければ送らない
//  3. 500人ずつ、再送キーを付けて送る（途中で失敗して再試行しても、同じ人に二重に届かない）

import type { SeminarEpisode } from "@/lib/types";
import { chunk, deliveryText, quotaAllows } from "@/lib/lineLogic";
import { getConsumption, getQuota, multicastText, retryKeyFor } from "./line";
import { sbAdmin } from "./supabaseAdmin";

export type DeliveryResult =
  | { episodeId: string; status: "sent"; recipients: number }
  | { episodeId: string; status: "skipped"; reason: string }
  | { episodeId: string; status: "failed"; reason: string };

async function finish(episodeId: string, patch: { status: "sent" | "failed"; recipients?: number; error?: string }) {
  await sbAdmin()
    .from("line_deliveries")
    .update({ status: patch.status, recipients: patch.recipients ?? null, error: patch.error ?? null, finished_at: new Date().toISOString() })
    .eq("episode_id", episodeId);
}

export async function activeSubscribers(): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sbAdmin().from("line_subscribers").select("line_user_id").eq("status", "active").order("line_user_id").range(from, from + 999);
    if (error) throw new Error(`申込者を読み込めませんでした（${error.code ?? "不明"}）`);
    ids.push(...(data ?? []).map((r) => r.line_user_id as string));
    if (!data || data.length < 1000) break;
  }
  return ids;
}

export async function deliverEpisode(ep: SeminarEpisode, trigger: "cron" | "manual"): Promise<DeliveryResult> {
  if (!ep.youtubeUrl) return { episodeId: ep.id, status: "skipped", reason: "YouTubeのURLが登録されていません" };
  const { data: claimed, error } = await sbAdmin().rpc("claim_line_delivery", { p_episode_id: ep.id, p_trigger: trigger });
  if (error) return { episodeId: ep.id, status: "failed", reason: `配信の記録ができませんでした（${error.code ?? "不明"}）` };
  if (!claimed) return { episodeId: ep.id, status: "skipped", reason: "この回は送信済み（または送信中）です" };

  try {
    const to = await activeSubscribers();
    if (to.length === 0) {
      await finish(ep.id, { status: "sent", recipients: 0 });
      return { episodeId: ep.id, status: "sent", recipients: 0 };
    }
    const [quota, used] = await Promise.all([getQuota(), getConsumption()]);
    const q = quotaAllows(quota, used, to.length);
    if (!q.ok) {
      const reason = `今月の残り通数（${q.remaining}通）が、送る人数（${to.length}人）より少ないため送っていません`;
      await finish(ep.id, { status: "failed", error: reason });
      return { episodeId: ep.id, status: "failed", reason };
    }
    const text = deliveryText(ep);
    const groups = chunk(to);
    for (let i = 0; i < groups.length; i++) await multicastText(groups[i], text, retryKeyFor(ep.id, i));
    await finish(ep.id, { status: "sent", recipients: to.length });
    return { episodeId: ep.id, status: "sent", recipients: to.length };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "送信に失敗しました";
    await finish(ep.id, { status: "failed", error: reason }).catch(() => undefined);
    return { episodeId: ep.id, status: "failed", reason };
  }
}
