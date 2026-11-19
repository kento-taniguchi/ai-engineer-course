"use client";

// 画面上部の同期の状態。ふだんは小さな表示だけ。両方で変更があったときだけ、選ぶボタンを出す。

import Link from "next/link";
import { useState } from "react";
import { SYNC_STATE_LABEL, useCloudSync } from "@/store/CloudSyncStore";
import { formatDateTime, formatTime } from "@/lib/time";
import { formatSummary } from "@/lib/cloudSync";

export function CloudSyncIndicator() {
  const s = useCloudSync();
  const [working, setWorking] = useState(false);
  if (s.state === "not-configured") return null;

  if (s.state === "conflict" && s.conflict) {
    const c = s.conflict;
    return (
      <div className="notice notice-warn small" role="alert" style={{ marginBottom: 12 }}>
        <strong>! この端末と他の端末の両方で変更がありました。</strong>どちらの内容を使うか選んでください（自動では上書きしません）。
        <ul style={{ margin: "6px 0 6px 20px" }}>
          <li>
            クラウド（{c.remoteDevice ?? "他の端末"}・{formatDateTime(c.remoteUpdatedAt)}）：{formatSummary(c.remote)}
          </li>
          <li>この端末：{formatSummary(c.local)}</li>
        </ul>
        <div className="row">
          <button
            className="btn btn-sm btn-primary"
            disabled={working}
            onClick={async () => {
              setWorking(true);
              await s.resolveConflict("remote");
              setWorking(false);
            }}
          >
            クラウドの内容を使う
          </button>
          <button
            className="btn btn-sm"
            disabled={working}
            onClick={async () => {
              if (!confirm("この端末の内容でクラウドを上書きしますか？\n（上書き前のクラウドの内容はファイルとして保存します）")) return;
              setWorking(true);
              await s.resolveConflict("local");
              setWorking(false);
            }}
          >
            この端末の内容を使う
          </button>
        </div>
        <p className="xs muted" style={{ marginTop: 6 }}>「クラウドの内容を使う」を選んでも、この端末の内容は同じブラウザ内に退避されます。</p>
      </div>
    );
  }

  const attention = s.state === "signed-out" || s.state === "setup" || s.state === "not-allowed" || s.state === "error";
  const tone = s.state === "synced" ? "badge-ok" : attention ? "badge-warning" : s.state === "offline" ? "badge-warning" : "badge-off";
  const icon = s.state === "synced" ? "✓" : s.state === "saving" || s.state === "checking" ? "…" : attention || s.state === "offline" ? "!" : "☁";

  return (
    <div className="row" style={{ justifyContent: "flex-end", marginBottom: 8, gap: 6 }} role="status" aria-live="polite">
      <Link href="/cloud" className={`badge ${tone}`} title={s.message ?? undefined} style={{ textDecoration: "none" }}>
        {icon} クラウド：{SYNC_STATE_LABEL[s.state]}
        {s.state === "synced" && s.lastSyncedAt && `（${formatTime(s.lastSyncedAt)}）`}
      </Link>
      {(s.state === "offline" || s.state === "error") && (
        <button className="btn btn-sm btn-ghost" onClick={() => s.checkNow()}>
          再試行
        </button>
      )}
    </div>
  );
}
