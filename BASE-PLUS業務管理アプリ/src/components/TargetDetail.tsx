"use client";

// 選手詳細・チーム詳細の共通レイアウト

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { TargetRef } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { bookingOf, nextBooking, lastBooking, reportsOf, targetName } from "@/lib/selectors";
import { formatRange, formatDate, dateKeyOf } from "@/lib/time";
import { setTodoStatus } from "@/lib/operations";
import { isOpen } from "@/lib/todoEngine";
import { AttachmentsPanel, LatestRecord, LessonHistory, MeasurementPanel } from "./RecordPanels";
import { LatestMeasurements, PlanCard, planHref } from "./LessonPlanParts";
import { bookingsOf, planOfBooking } from "@/lib/selectors";
import { KindBadge, StatusChip } from "./ui";

export interface ExtraTab {
  key: string;
  label: string;
  content: ReactNode;
}

export function TargetDetail({
  target,
  backHref,
  backLabel,
  subtitle,
  overview,
  extraTabs = [],
}: {
  target: TargetRef;
  backHref: string;
  backLabel: string;
  subtitle: ReactNode;
  overview: ReactNode;
  extraTabs?: ExtraTab[];
}) {
  const { data, now } = useApp();
  const params = useSearchParams();
  const reviewId = params.get("review");
  const reviewTodo = reviewId ? data.todos.find((t) => t.id === reviewId) : undefined;
  const [tab, setTab] = useState("overview");

  const next = nextBooking(data, target, now);
  const last = lastBooking(data, target, now);
  const latest = reportsOf(data, target)[0];

  const tabs: ExtraTab[] = [
    {
      key: "overview",
      label: "概要",
      content: (
        <div className="stack-2">
          <UpcomingPlans target={target} />
          {overview}
          <div className="grid-2">
            <div>
              <h3 style={{ marginBottom: 8 }}>前回の指導内容</h3>
              {latest ? (
                <div className="card small">
                  <p className="muted xs">{formatDate(latest.date)}</p>
                  <p className="pre">{latest.content || "（未入力）"}</p>
                  {latest.nextPoints && (
                    <p className="pre" style={{ marginTop: 8 }}>
                      <strong>次回までのポイント：</strong>
                      {latest.nextPoints}
                    </p>
                  )}
                </div>
              ) : (
                <div className="empty">前回の記録がありません</div>
              )}
            </div>
            <div>
              <h3 style={{ marginBottom: 8 }}>自主練習の内容</h3>
              {latest?.homework ? (
                <div className="card small pre">{latest.homework}</div>
              ) : (
                <div className="empty">自主練習の記録はありません</div>
              )}
            </div>
          </div>
        </div>
      ),
    },
    ...extraTabs,
    { key: "history", label: "指導履歴・フィードバック", content: <LessonHistory target={target} /> },
    { key: "measure", label: "測定結果", content: <MeasurementPanel target={target} /> },
    { key: "media", label: "写真・動画", content: <AttachmentsPanel target={target} /> },
  ];

  return (
    <>
      <Link href={backHref} className="back-link">
        <span aria-hidden="true">←</span> {backLabel}
      </Link>
      <div className="page-head">
        <div>
          <h1>{targetName(data, target)}</h1>
          <p className="sub">{subtitle}</p>
        </div>
        <div className="row">
          <Link href={`/report?target=${target.type}:${target.id}`} className="btn">
            ＋ 記録を作成
          </Link>
        </div>
      </div>

      {reviewTodo && <ReviewBanner todoId={reviewTodo.id} target={target} />}

      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="card stat">
          <span className="stat-label">前回の指導日</span>
          <span style={{ fontWeight: 700 }}>{last ? formatRange(last.start, last.end) : "記録なし"}</span>
        </div>
        <div className="card stat">
          <span className="stat-label">次回の予約</span>
          <span style={{ fontWeight: 700 }}>{next ? formatRange(next.start, next.end) : "予定なし"}</span>
          {next && <KindBadge kind={next.kind} />}
        </div>
        <div className="card stat">
          <span className="stat-label">指導記録（レポート）</span>
          <span style={{ fontWeight: 700 }}>{reportsOf(data, target).length}件</span>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="詳細の切り替え">
        {tabs.map((t) => (
          <button key={t.key} role="tab" className="tab" aria-selected={tab === t.key} aria-controls={`panel-${t.key}`} id={`tab-${t.key}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) =>
        t.key === tab ? (
          <div key={t.key} role="tabpanel" id={`panel-${t.key}`} aria-labelledby={`tab-${t.key}`}>
            {t.content}
          </div>
        ) : null,
      )}
    </>
  );
}

/** ToDo「前回記録を確認」から開いたときの表示 */
function ReviewBanner({ todoId, target }: { todoId: string; target: TargetRef }) {
  const { data, update } = useApp();
  const todo = data.todos.find((t) => t.id === todoId)!;
  const b = bookingOf(data, todo);
  return (
    <section className="card section" style={{ borderColor: "var(--gold)", borderWidth: 2 }} aria-labelledby="h-review-banner">
      <div className="section-head">
        <h2 id="h-review-banner">指導前の確認：前回の記録</h2>
        <StatusChip status={todo.status} />
      </div>
      {b && (
        <p className="small" style={{ marginBottom: 12 }}>
          次回の指導：<strong>{formatRange(b.start, b.end)}</strong> <KindBadge kind={b.kind} />
        </p>
      )}
      <LatestRecord target={target} beforeISO={b?.start} />
      <h3 style={{ margin: "12px 0 4px" }}>最新の測定結果</h3>
      <LatestMeasurements target={target} beforeISO={b?.start} />
      {b?.plan && (
        <div style={{ marginTop: 12 }}>
          <h3 style={{ marginBottom: 4 }}>今回の指導案</h3>
          <div className="card small pre">{b.plan}</div>
        </div>
      )}
      <div className="row" style={{ marginTop: 16 }}>
        {isOpen(todo) ? (
          <button className="btn btn-primary" onClick={() => update((d, n) => setTodoStatus(d, todo.id, "done", "前回記録を確認した", n), "「前回記録を確認」を完了にしました")}>
            ✓ 確認した（完了にする）
          </button>
        ) : (
          <span className="badge badge-ok">✓ 確認済み（{todo.statusChangedAt ? formatDate(dateKeyOf(todo.statusChangedAt)) : ""}）</span>
        )}
        {b && (
          <Link href={planHref(b.id)} className="btn btn-gold">
            {planOfBooking(data, b.id) ? "今回の指導メモを見る・編集 →" : "今回の指導内容をメモ →"}
          </Link>
        )}
        <Link href="/" className="btn">
          今日の仕事へ戻る
        </Link>
      </div>
      <p className="xs muted" style={{ marginTop: 8 }}>前回記録の確認と、今回の指導内容のメモは別の作業です。</p>
    </section>
  );
}

/** 今後の予約と、それぞれの指導メモ（指導当日の再確認用） */
function UpcomingPlans({ target }: { target: TargetRef }) {
  const { data, now } = useApp();
  const upcoming = bookingsOf(data, target)
    .filter((b) => new Date(b.end) > now)
    .slice(0, 3);
  if (upcoming.length === 0) return null;
  return (
    <section aria-labelledby="h-upcoming-plans">
      <h3 id="h-upcoming-plans" style={{ marginBottom: 8 }}>
        今後の予約と指導メモ
      </h3>
      <div className="stack">
        {upcoming.map((b) => (
          <PlanCard key={b.id} booking={b} />
        ))}
      </div>
    </section>
  );
}
