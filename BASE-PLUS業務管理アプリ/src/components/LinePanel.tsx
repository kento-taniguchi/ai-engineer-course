"use client";

// 公式LINE（自動返信・配信日の一斉送信）の状況と、「今すぐ申込者に送る」ボタン

import { useCallback, useEffect, useState } from "react";
import type { SeminarEpisode } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { useCloudSync } from "@/store/CloudSyncStore";
import { currentAccessToken } from "@/services/supabaseCloudStore";
import { cloudConfig } from "@/services/cloudStore";
import { LINE_KEYWORD_STOP, LINE_KEYWORD_SUBSCRIBE, deliveryText } from "@/lib/lineLogic";
import { dateKey, formatDate, formatDateTime } from "@/lib/time";
import { Modal } from "./ui";

interface Delivery {
  episode_id: string;
  status: "sending" | "sent" | "failed";
  trigger: string | null;
  started_at: string;
  finished_at: string | null;
  recipients: number | null;
  error: string | null;
}

interface Status {
  ok: boolean;
  message?: string;
  configured?: { lineSecret: boolean; lineToken: boolean; supabase: boolean; cron: boolean };
  tablesReady?: boolean;
  subscribers?: { active: number; stopped: number; blocked: number };
  quota?: { type: "none" | "limited"; value?: number } | null;
  used?: number | null;
  lineError?: string | null;
  keyProblems?: string[];
  deliveries?: Delivery[];
}

export function useLineStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!cloudConfig().configured) return;
    setLoading(true);
    try {
      const token = await currentAccessToken();
      const res = await fetch("/api/line/status", { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
      setStatus((await res.json()) as Status);
    } catch {
      setStatus({ ok: false, message: "連携状況を確認できませんでした（インターネット接続を確認してください）" });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { status, loading, reload: load };
}

function remainingOf(s: Status): number | null {
  if (!s.quota || s.used == null) return null;
  return s.quota.type === "none" ? null : Math.max(0, (s.quota.value ?? 0) - s.used);
}

export function LinePanel({ ep }: { ep?: SeminarEpisode }) {
  const { now, notify } = useApp();
  const sync = useCloudSync();
  const { status, loading, reload } = useLineStatus();
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  if (!cloudConfig().configured) return null;
  const c = status?.configured;
  const ready = !!c && c.lineSecret && c.lineToken && c.supabase && status?.tablesReady !== false;
  const subs = status?.subscribers;
  const remaining = status ? remainingOf(status) : null;
  const delivery = ep ? status?.deliveries?.find((d) => d.episode_id === ep.id) : undefined;
  const today = dateKey(now);

  const send = async () => {
    if (!ep) return;
    setSending(true);
    setResult(null);
    try {
      const token = await currentAccessToken();
      const res = await fetch("/api/line/deliver", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ episodeId: ep.id }),
      });
      const j = (await res.json()) as { ok: boolean; message?: string; result?: { status: string; recipients?: number; reason?: string } };
      const msg = j.result?.status === "sent" ? `✓ ${j.result.recipients ?? 0}人に送りました` : `⚠ ${j.result?.reason ?? j.message ?? "送信できませんでした"}`;
      setResult(msg);
      notify(msg.replace(/^[✓⚠] /, ""), j.ok ? "ok" : "error");
    } catch {
      setResult("⚠ 送信できませんでした（インターネット接続を確認してください）");
    } finally {
      setSending(false);
      void reload();
    }
  };

  return (
    <section className="card section stack-2" aria-labelledby="h-line-auto">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row">
          <h2 id="h-line-auto">公式LINE（自動返信・配信日の一斉送信）</h2>
          {status && (ready ? <span className="badge badge-ok">✓ 連携中</span> : <span className="badge badge-off">設定が未完了</span>)}
        </div>
        <button className="btn btn-sm btn-ghost" onClick={() => void reload()} disabled={loading}>
          {loading ? "確認中…" : "状況を更新"}
        </button>
      </div>

      {status && !status.ok && <p className="small" role="alert">⚠ {status.message}</p>}
      {(status?.keyProblems?.length ?? 0) > 0 && (
        <div className="notice notice-danger small" role="alert">
          {status!.keyProblems!.map((p) => (
            <div key={p}>⚠ {p}</div>
          ))}
        </div>
      )}
      {status?.ok && !ready && (
        <ul className="small" style={{ margin: "0 0 0 20px" }}>
          <li>{c?.lineSecret && c?.lineToken ? "✓" : "□"} LINEの鍵（Vercelに登録）</li>
          <li>{c?.supabase ? "✓" : "□"} サーバー用のSupabaseの鍵（Vercelに登録）</li>
          <li>{status.tablesReady ? "✓" : "□"} 申込者・配信の記録の表（supabase/line.sql を実行）</li>
        </ul>
      )}
      {status?.ok && ready && (
        <>
          <p className="small">
            「{LINE_KEYWORD_SUBSCRIBE}」と送ってきた人に最新回のURLを自動で返信し、申込者として記録します（返信は無料）。配信日には申込者へ新しい回のURLを自動で送ります（毎日19時台に確認）。「{LINE_KEYWORD_STOP}」で停止できます。
          </p>
          <dl className="fields">
            <dt>申込者</dt>
            <dd>
              {subs?.active ?? 0}人（停止 {subs?.stopped ?? 0}・ブロック {subs?.blocked ?? 0}）
            </dd>
            <dt>今月の通数</dt>
            <dd>
              {status.lineError ? `⚠ ${status.lineError}` : status.quota?.type === "none" ? `上限なし（使用 ${status.used ?? 0}通）` : `残り ${remaining ?? "?"}通（上限 ${status.quota?.value ?? "?"}通・使用 ${status.used ?? "?"}通）`}
            </dd>
            {!c?.cron && (
              <>
                <dt>自動送信</dt>
                <dd>⚠ 定期実行の鍵（CRON_SECRET）が未登録のため、配信日の自動送信は動きません</dd>
              </>
            )}
          </dl>
        </>
      )}

      {ep && status?.ok && ready && (
        <div className="stack-2" style={{ borderTop: "1px solid var(--line, #e5e7eb)", paddingTop: 12 }}>
          <p className="small">
            <strong>この回（{formatDate(ep.deliveryDate)}配信）：</strong>
            {delivery
              ? delivery.status === "sent"
                ? `✓ 送信済み（${delivery.recipients ?? 0}人・${formatDateTime(delivery.finished_at ?? delivery.started_at)}・${delivery.trigger === "cron" ? "自動" : "手動"}）`
                : delivery.status === "sending"
                  ? "送信中…"
                  : `⚠ 送信できませんでした：${delivery.error ?? "不明"}（もう一度送れます）`
              : !ep.youtubeUrl
                ? "YouTubeのURLを登録すると送れます"
                : ep.deliveryDate > today
                  ? `配信日（${formatDate(ep.deliveryDate)}）の19時台に自動で送ります`
                  : ep.deliveryDate === today
                    ? "今日の19時台に自動で送ります"
                    : "未送信（配信日を過ぎています。必要なら手動で送れます）"}
          </p>
          {ep.youtubeUrl && delivery?.status !== "sent" && delivery?.status !== "sending" && (
            <div>
              <button className="btn btn-sm" disabled={sending || (subs?.active ?? 0) === 0} onClick={() => setConfirm(true)}>
                今すぐ申込者に送る（{subs?.active ?? 0}人）
              </button>
              {(subs?.active ?? 0) === 0 && <span className="xs muted" style={{ marginLeft: 8 }}>申込者がまだいません</span>}
            </div>
          )}
          {result && <p className="small" role="status">{result}</p>}
        </div>
      )}

      {confirm && ep && (
        <Modal
          title="申込者にこの回のURLを送りますか？"
          onClose={() => setConfirm(false)}
          actions={
            <>
              <button className="btn" onClick={() => setConfirm(false)} disabled={sending}>
                やめる
              </button>
              <button
                className="btn btn-primary"
                disabled={sending || sync.state === "saving"}
                onClick={async () => {
                  setConfirm(false);
                  await send();
                }}
              >
                {sending ? "送信中…" : `${subs?.active ?? 0}人に送る`}
              </button>
            </>
          }
        >
          <p className="small">
            申込者 <strong>{subs?.active ?? 0}人</strong> に送ります（今月の通数を{subs?.active ?? 0}通使います{remaining != null ? `・残り ${remaining}通` : ""}）。同じ回は二重に送られません。
          </p>
          <pre className="small" style={{ whiteSpace: "pre-wrap", background: "var(--bg-soft, #f6f7f9)", padding: 8, borderRadius: 6, marginTop: 8 }}>
            {deliveryText(ep)}
          </pre>
          {sync.state !== "synced" && <p className="small" role="alert">⚠ クラウドとの同期が終わっていません（{sync.state}）。送るのは、クラウドに保存されている内容です。</p>}
        </Modal>
      )}
    </section>
  );
}
