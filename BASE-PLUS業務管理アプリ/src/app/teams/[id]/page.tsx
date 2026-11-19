"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useState } from "react";
import type { TeamContract } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { TargetDetail } from "@/components/TargetDetail";
import { Empty, KindBadge } from "@/components/ui";
import { bookingsOf } from "@/lib/selectors";
import { formatRange, formatYen } from "@/lib/time";
import { setBookingPlan } from "@/lib/operations";

export default function TeamDetailPage() {
  return (
    <Suspense>
      <TeamDetail />
    </Suspense>
  );
}

function TeamDetail() {
  const { id } = useParams<{ id: string }>();
  const { data } = useApp();
  const t = data.teams.find((x) => x.id === id);
  if (!t) {
    return (
      <>
        <Link href="/teams" className="back-link">
          ← チーム一覧
        </Link>
        <Empty>チームが見つかりません</Empty>
      </>
    );
  }
  const target = { type: "team" as const, id: t.id };
  return (
    <TargetDetail
      target={target}
      backHref="/teams"
      backLabel="チーム一覧"
      subtitle={`${t.category}・${t.notes}`}
      overview={<ContractCard teamId={t.id} />}
      extraTabs={[{ key: "plan", label: "指導案", content: <PlanPanel teamId={t.id} /> }]}
    />
  );
}

function ContractCard({ teamId }: { teamId: string }) {
  const { data, update } = useApp();
  const t = data.teams.find((x) => x.id === teamId)!;
  const [editing, setEditing] = useState(false);
  const [c, setC] = useState<TeamContract>(t.contract);

  return (
    <div className="card">
      <div className="section-head" style={{ marginBottom: 8 }}>
        <h3>契約内容</h3>
        {!editing && (
          <button
            className="btn btn-sm"
            onClick={() => {
              setC(t.contract);
              setEditing(true);
            }}
          >
            編集
          </button>
        )}
      </div>
      {editing ? (
        <div className="stack-2">
          <div className="grid-2" style={{ gap: 16 }}>
            <label className="field">
              月の訪問回数
              <input type="number" min={0} value={c.visitsPerMonth} onChange={(e) => setC({ ...c, visitsPerMonth: Number(e.target.value) })} />
            </label>
            <label className="field">
              月額（円）
              <input type="number" min={0} step={1000} value={c.monthlyFee} onChange={(e) => setC({ ...c, monthlyFee: Number(e.target.value) })} />
            </label>
            <label className="field">
              契約開始日
              <input type="date" value={c.startDate} onChange={(e) => setC({ ...c, startDate: e.target.value })} />
            </label>
            <label className="field">
              備考
              <input type="text" value={c.notes} onChange={(e) => setC({ ...c, notes: e.target.value })} />
            </label>
          </div>
          <p className="xs muted">※ 月額契約は訪問回数に関係なく、売上は1か月1件として計上します。</p>
          <div className="row">
            <button
              className="btn btn-primary"
              onClick={() => {
                update(
                  (d) => ({
                    ...d,
                    teams: d.teams.map((x) => (x.id === teamId ? { ...x, contract: c } : x)),
                    // 今月以降の予定額（未入金）の月額を更新
                    sales: d.sales.map((s) =>
                      s.source.type === "contract" && s.source.teamId === teamId && s.status === "planned"
                        ? { ...s, amount: c.monthlyFee, description: `${teamNameOf(d, teamId)} 月額（月${c.visitsPerMonth}回）` }
                        : s,
                    ),
                  }),
                  "契約内容を保存しました",
                );
                setEditing(false);
              }}
            >
              保存する
            </button>
            <button className="btn" onClick={() => setEditing(false)}>
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <dl className="fields">
          <dt>訪問回数</dt>
          <dd>月{t.contract.visitsPerMonth}回</dd>
          <dt>月額</dt>
          <dd>{formatYen(t.contract.monthlyFee)}</dd>
          <dt>契約開始日</dt>
          <dd>{t.contract.startDate}</dd>
          <dt>担当者</dt>
          <dd>{t.contactPerson}</dd>
          <dt>備考</dt>
          <dd>{t.contract.notes || "-"}</dd>
        </dl>
      )}
    </div>
  );
}

function teamNameOf(d: { teams: { id: string; name: string }[] }, id: string): string {
  return d.teams.find((t) => t.id === id)?.name ?? "";
}

function PlanPanel({ teamId }: { teamId: string }) {
  const { data, now, update } = useApp();
  const upcoming = bookingsOf(data, { type: "team", id: teamId }).filter((b) => new Date(b.end) > now);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  if (upcoming.length === 0) return <Empty>今後の予定がありません</Empty>;
  return (
    <div className="stack-2">
      <p className="small muted">今後の訪問ごとに指導案を作成できます。「前回記録を確認」ToDoからも表示されます。</p>
      {upcoming.map((b) => {
        const value = drafts[b.id] ?? b.plan ?? "";
        return (
          <div key={b.id} className="card stack">
            <div className="row">
              <strong>{formatRange(b.start, b.end)}</strong>
              <KindBadge kind={b.kind} />
              <span className="small muted">{b.location}</span>
            </div>
            <label className="field">
              指導案
              <textarea value={value} onChange={(e) => setDrafts({ ...drafts, [b.id]: e.target.value })} placeholder="例：1. ウォームアップ 2. ..." />
            </label>
            <div>
              <button className="btn btn-sm btn-primary" disabled={value === (b.plan ?? "")} onClick={() => update((d) => setBookingPlan(d, b.id, value), "指導案を保存しました")}>
                保存する
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
