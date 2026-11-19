"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/store/AppStore";
import { lastBooking, newId, nextBooking } from "@/lib/selectors";
import { formatDate, dateKeyOf } from "@/lib/time";
import { DemoBar, Empty, PageHead } from "@/components/ui";
import { PlayerForm } from "@/components/PlayerForm";

export default function PlayersPage() {
  const { data, now, update } = useApp();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const query = q.trim().replace(/[\s　]/g, "");
  const list = data.players.filter((p) => !query || [p.name, p.kana, p.grade, p.affiliation, p.position].some((v) => v.replace(/[\s　]/g, "").includes(query)));

  return (
    <>
      <PageHead title="選手" sub={`${data.players.length}名（架空）`}>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          ＋ 選手を追加
        </button>
      </PageHead>
      <DemoBar>選手はすべて架空の人物です。</DemoBar>
      <label className="field" style={{ marginBottom: 16, maxWidth: 400 }}>
        <span className="sr-only">検索</span>
        <input type="search" placeholder="名前・ふりがな・学年で検索" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {list.length === 0 ? (
        <Empty>該当する選手がいません</Empty>
      ) : (
        <ul className="list">
          {list.map((p) => {
            const target = { type: "player" as const, id: p.id };
            const last = lastBooking(data, target, now);
            const next = nextBooking(data, target, now);
            return (
              <li key={p.id}>
                <Link href={`/players/${p.id}`} className="list-link">
                  <div className="list-main">
                    <div>
                      <strong>{p.name}</strong> <span className="small muted">{p.grade}・{p.position}</span>
                    </div>
                    <div className="small muted">
                      前回：{last ? formatDate(dateKeyOf(last.start)) : "記録なし"} ／ 次回：{next ? formatDate(dateKeyOf(next.start)) : "予定なし"}
                    </div>
                  </div>
                  <span className="chev" aria-hidden="true">
                    ›
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {adding && (
        <PlayerForm
          title="選手を追加"
          onClose={() => setAdding(false)}
          onSave={(p) => update((d) => ({ ...d, players: [...d.players, { ...p, id: newId("p") }] }), `${p.name} さんを追加しました`)}
        />
      )}
    </>
  );
}
