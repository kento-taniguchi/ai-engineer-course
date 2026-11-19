"use client";

// 今回の指導内容のメモ  /plan?booking=予約ID
// 指導前日に前回記録を確認したあと、今回の予定を大まかにメモする。予約と対象者に紐づけて保存。

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import type { LessonPlan } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { newId, planOfBooking, targetHref, targetName } from "@/lib/selectors";
import { planIsEmpty, upsertLessonPlan } from "@/lib/operations";
import { bookingTodoId, isOpen } from "@/lib/todoEngine";
import { formatDateTime, formatRange, toISO } from "@/lib/time";
import { LatestRecord } from "@/components/RecordPanels";
import { LatestMeasurements, PLAN_FIELDS } from "@/components/LessonPlanParts";
import { Empty, KindBadge, StatusChip } from "@/components/ui";

export default function PlanPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const params = useSearchParams();
  const bookingId = params.get("booking") ?? "";
  const { data, now } = useApp();
  const [freshId] = useState(() => newId("plan"));
  const b = data.bookings.find((x) => x.id === bookingId);
  if (!b || !b.target) {
    return (
      <>
        <Link href="/" className="back-link">
          ← 今日の仕事
        </Link>
        <Empty>{b ? "この予約は対象者が決まっていません。先に対象者を選んでください。" : "対象の予約が見つかりません"}</Empty>
      </>
    );
  }
  const initial: LessonPlan = planOfBooking(data, b.id) ?? {
    id: freshId,
    bookingId: b.id,
    target: b.target,
    purpose: "",
    content: "",
    checks: "",
    tools: "",
    memo: "",
    bookingStartAtSave: b.start,
    createdAt: toISO(now),
    updatedAt: toISO(now),
  };
  return <PlanEditor key={initial.id} initial={initial} />;
}

function PlanEditor({ initial }: { initial: LessonPlan }) {
  const { data, update } = useApp();
  const [p, setP] = useState<LessonPlan>(initial);
  const b = data.bookings.find((x) => x.id === p.bookingId)!;
  const saved = data.lessonPlans.find((x) => x.id === p.id);
  const dirty = !saved || PLAN_FIELDS.some((f) => saved[f.key] !== p[f.key]);
  const reviewTodo = data.todos.find((t) => t.id === bookingTodoId(b.id, "review_prev"));
  const planTodo = data.todos.find((t) => t.id === bookingTodoId(b.id, "lesson_plan"));
  const moved = saved && saved.bookingStartAtSave !== b.start;

  return (
    <>
      <Link href={targetHref(p.target)} className="back-link">
        <span aria-hidden="true">←</span> {targetName(data, p.target)} の詳細
      </Link>
      <div className="page-head">
        <div>
          <h1>今回の指導内容のメモ</h1>
          <p className="sub">指導前に、今回やることを大まかにメモします（すべて任意・短いメモだけでも保存できます）</p>
        </div>
        <div className="row">
          {saved ? (
            <span className={`badge ${dirty ? "badge-warning" : "badge-ok"}`}>{dirty ? "! 未保存の変更あり" : `✓ 保存済み ${formatDateTime(saved.updatedAt)}`}</span>
          ) : (
            <span className="badge badge-warning">! 未保存（新規）</span>
          )}
        </div>
      </div>

      <div className="card section plan-target" role="note" aria-label="対象の予約">
        <div className="stat-label">このメモを紐づける予約</div>
        <div className="row" style={{ marginTop: 4 }}>
          <strong style={{ fontSize: 20 }}>{targetName(data, p.target)}</strong>
          <KindBadge kind={b.kind} />
        </div>
        <div style={{ fontWeight: 700, color: "var(--navy)" }}>指導 {formatRange(b.start, b.end)}</div>
        {b.location && <div className="small muted">{b.location}</div>}
        {b.status !== "scheduled" && (
          <p className="small" style={{ marginTop: 8 }}>
            <span className="badge badge-danger">この予約は{b.status === "cancelled" ? "キャンセル" : "削除"}されています（メモは残ります）</span>
          </p>
        )}
        {moved && (
          <p className="small" style={{ marginTop: 8 }}>
            <span className="badge badge-warning">! 保存後に予約日時が変更されました（保存時：{formatDateTime(saved!.bookingStartAtSave)}）。内容が今回の予定に合っているか確認してください。</span>
          </p>
        )}
      </div>

      <div className="grid-2">
        <section className="stack-2" aria-labelledby="h-plan-form">
          <h2 id="h-plan-form">今回の予定</h2>
          {PLAN_FIELDS.map((f) => (
            <label key={f.key} className="field">
              {f.label}
              <textarea value={p[f.key]} onChange={(e) => setP({ ...p, [f.key]: e.target.value })} placeholder={f.placeholder} style={{ minHeight: f.key === "content" ? 96 : 64 }} />
            </label>
          ))}
          <div className="row sticky-actions">
            <button
              className="btn btn-primary"
              disabled={!dirty || planIsEmpty(p)}
              onClick={() => update((d, n) => upsertLessonPlan(d, p, n), "今回の指導内容のメモを保存しました")}
            >
              {saved ? "変更を保存" : "保存する"}
            </button>
            <Link href="/" className="btn">
              今日の仕事へ
            </Link>
            {planIsEmpty(p) && <span className="xs muted">どれか1つ入力すると保存できます</span>}
          </div>
          <div className="small stack" style={{ gap: 4 }}>
            <span>
              「今回の指導内容をメモ」：{planTodo ? <StatusChip status={planTodo.status} /> : <span className="muted">ToDoなし</span>}
            </span>
            <span>
              「前回記録を確認」：{reviewTodo ? <StatusChip status={reviewTodo.status} /> : <span className="muted">ToDoなし</span>}
              {reviewTodo && isOpen(reviewTodo) && <span className="xs muted">（別の作業です。メモを保存しても完了にはなりません）</span>}
            </span>
          </div>
        </section>

        <section className="stack-2" aria-labelledby="h-plan-ref">
          <h2 id="h-plan-ref">参考：前回の記録</h2>
          <LatestRecord target={p.target} beforeISO={b.start} />
          <h3>最新の測定結果</h3>
          <LatestMeasurements target={p.target} beforeISO={b.start} />
          {b.plan && (
            <div>
              <h3 style={{ marginBottom: 4 }}>チームの指導案（既存）</h3>
              <div className="card small pre">{b.plan}</div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
