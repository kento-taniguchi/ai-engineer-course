"use client";

// プチセミナーの準備作業のルール（配信曜日ごとに、どの作業を配信の何日前に行うか）と、配信回ごとのToDo一覧

import Link from "next/link";
import { useState } from "react";
import type { SeminarEpisode, SeminarRule } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { newId, todoTitle } from "@/lib/selectors";
import { DEFAULT_SEMINAR_RULES } from "@/lib/migrate";
import { daysBeforeLabel, ruleForEpisode, seminarTaskDate } from "@/lib/workTasks";
import { formatDate, weekdayLabel } from "@/lib/time";
import { OffBadge, StatusChip } from "./ui";

const WD = [1, 2, 3, 4, 5, 6, 0];

export function SeminarRulesEditor() {
  const { data, update } = useApp();
  const rules = data.seminarRules ?? [];
  const [draft, setDraft] = useState<SeminarRule[] | null>(null);
  const editing = draft !== null;
  const view = draft ?? rules;

  const setRule = (i: number, p: Partial<SeminarRule>) => setDraft((d) => (d ?? rules).map((r, j) => (j === i ? { ...r, ...p } : r)));

  return (
    <section className="card section stack-2" aria-labelledby="h-rules">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <h2 id="h-rules">準備作業のルール</h2>
        {!editing ? (
          <button className="btn btn-sm" onClick={() => setDraft(rules.map((r) => ({ ...r, tasks: r.tasks.map((t) => ({ ...t })) })))}>
            編集
          </button>
        ) : null}
      </div>
      <p className="xs muted">配信日に合わせて、各作業が対応日に「今日やること」の「プチセミナー」に表示されます（期限は配信日の前日まで）。初期値は候補です。運用に合わせて変更してください。</p>
      {view.length === 0 && <p className="small muted">ルールはありません</p>}
      {view.map((r, i) => (
        <div key={r.id} className="card stack" style={{ background: "#fbfcfe" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            {editing ? (
              <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                配信曜日
                <select value={r.deliveryWeekday} onChange={(e) => setRule(i, { deliveryWeekday: Number(e.target.value) })} style={{ width: "auto" }}>
                  {WD.map((w) => (
                    <option key={w} value={w}>
                      {weekdayLabel(w)}曜日
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <strong>{weekdayLabel(r.deliveryWeekday)}曜日配信分</strong>
            )}
            {editing && (
              <button className="btn btn-sm btn-ghost" onClick={() => setDraft((d) => (d ?? rules).filter((_, j) => j !== i))}>
                このルールを削除
              </button>
            )}
          </div>
          <ul className="small" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {r.tasks.map((t, k) =>
              editing ? (
                <li key={t.key + k} className="row" style={{ flexWrap: "nowrap", gap: 4 }}>
                  <input type="text" value={t.label} aria-label="作業名" onChange={(e) => setRule(i, { tasks: r.tasks.map((x, m) => (m === k ? { ...x, label: e.target.value } : x)) })} />
                  <select
                    value={t.daysBefore}
                    aria-label="作業日"
                    style={{ width: "auto" }}
                    onChange={(e) => setRule(i, { tasks: r.tasks.map((x, m) => (m === k ? { ...x, daysBefore: Number(e.target.value) } : x)) })}
                  >
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
                      <option key={n} value={n}>
                        {daysBeforeLabel(r.deliveryWeekday, n)}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-sm btn-ghost" aria-label={`${t.label}を削除`} onClick={() => setRule(i, { tasks: r.tasks.filter((_, m) => m !== k) })}>
                    ×
                  </button>
                </li>
              ) : (
                <li key={t.key + k}>
                  ・{t.label}：{daysBeforeLabel(r.deliveryWeekday, t.daysBefore)}
                  {t.key === "line" && <span className="xs muted">（LINE未連携）</span>}
                </li>
              ),
            )}
          </ul>
          {editing && (
            <div>
              <button className="btn btn-sm" onClick={() => setRule(i, { tasks: [...r.tasks, { key: newId("st"), label: "新しい作業", daysBefore: 1 }] })}>
                ＋ 作業を追加
              </button>
            </div>
          )}
        </div>
      ))}
      {editing && (
        <div className="row">
          <button className="btn btn-sm" onClick={() => setDraft((d) => [...(d ?? rules), { id: newId("rule"), deliveryWeekday: 3, tasks: [{ key: "shoot", label: "解説動画を撮影する", daysBefore: 1 }] }])}>
            ＋ 配信曜日を追加
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setDraft(DEFAULT_SEMINAR_RULES.map((r) => ({ ...r, tasks: r.tasks.map((t) => ({ ...t })) })))}>
            初期値に戻す
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn btn-sm" onClick={() => setDraft(null)}>
            キャンセル
          </button>
          <button
            className="btn btn-sm btn-primary"
            disabled={view.some((r) => r.tasks.some((t) => !t.label.trim())) || new Set(view.map((r) => r.deliveryWeekday)).size !== view.length}
            onClick={() => {
              update((d) => ({ ...d, seminarRules: view }), "準備作業のルールを保存しました");
              setDraft(null);
            }}
          >
            ルールを保存する
          </button>
        </div>
      )}
      {editing && new Set(view.map((r) => r.deliveryWeekday)).size !== view.length && <p className="xs" style={{ color: "var(--danger)" }}>⚠ 同じ配信曜日のルールが2つあります</p>}
      <p className="xs muted">作業をルールから外すと、その作業の未完了のToDoは表示されなくなります（完了済みの記録は残ります）。</p>
    </section>
  );
}

/** 配信回ごとの準備作業とToDoの状態 */
export function EpisodeTasks({ ep }: { ep: SeminarEpisode }) {
  const { data } = useApp();
  const rule = ruleForEpisode(data.seminarRules ?? [], ep);
  if (!rule) return <p className="small muted">この配信曜日の準備作業のルールはありません（一覧画面の「準備作業のルール」で追加できます）。</p>;
  return (
    <ul className="list small">
      {rule.tasks.map((t) => {
        const todo = data.todos.find((x) => x.id === `seminar:${ep.id}:task:${t.key}`);
        return (
          <li key={t.key} className="row" style={{ padding: "8px 12px", justifyContent: "space-between" }}>
            <span>
              {todo ? todoTitle(data, todo) : t.label}
              <span className="xs muted">　対応日 {formatDate(seminarTaskDate(ep, t))}</span>
              {t.key === "line" && (
                <span style={{ marginLeft: 4 }}>
                  <OffBadge>LINE未連携</OffBadge>
                </span>
              )}
            </span>
            {todo ? <StatusChip status={todo.status} /> : <span className="xs muted">{ep.status === "delivered" ? "配信済み" : "-"}</span>}
          </li>
        );
      })}
      <li style={{ padding: "8px 12px" }} className="xs muted">
        ToDoを完了にしても、公式LINEの配信予約は完了しません。<Link href="/">今日の仕事へ</Link>
      </li>
    </ul>
  );
}
