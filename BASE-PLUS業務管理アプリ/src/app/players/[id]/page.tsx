"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useApp } from "@/store/AppStore";
import { TargetDetail } from "@/components/TargetDetail";
import { PlayerForm } from "@/components/PlayerForm";
import { Empty } from "@/components/ui";

export default function PlayerDetailPage() {
  return (
    <Suspense>
      <PlayerDetail />
    </Suspense>
  );
}

function PlayerDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, update } = useApp();
  const [editing, setEditing] = useState(false);
  const p = data.players.find((x) => x.id === id);
  if (!p) {
    return (
      <>
        <Link href="/players" className="back-link">
          ← 選手一覧
        </Link>
        <Empty>選手が見つかりません</Empty>
      </>
    );
  }
  return (
    <>
      <TargetDetail
        target={{ type: "player", id: p.id }}
        backHref="/players"
        backLabel="選手一覧"
        subtitle={`${p.kana}・${p.grade}・${p.position}`}
        overview={
          <div className="card">
            <div className="section-head" style={{ marginBottom: 8 }}>
              <h3>基本情報</h3>
              <button className="btn btn-sm" onClick={() => setEditing(true)}>
                編集
              </button>
            </div>
            <dl className="fields">
              <dt>学年</dt>
              <dd>{p.grade || "-"}</dd>
              <dt>ポジション</dt>
              <dd>{p.position || "-"}</dd>
              <dt>所属</dt>
              <dd>{p.affiliation || "-"}</dd>
              <dt>連絡方法</dt>
              <dd>{p.contactMemo || "-"}</dd>
              <dt>メモ</dt>
              <dd>{p.notes || "-"}</dd>
            </dl>
          </div>
        }
      />
      {editing && (
        <PlayerForm
          title="基本情報を編集"
          initial={p}
          onClose={() => setEditing(false)}
          onSave={(np) => update((d) => ({ ...d, players: d.players.map((x) => (x.id === np.id ? np : x)) }), "基本情報を保存しました")}
        />
      )}
    </>
  );
}
