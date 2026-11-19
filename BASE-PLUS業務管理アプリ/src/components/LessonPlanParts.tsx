"use client";

// 今回の指導内容のメモ・最新の測定結果の表示部品

import Link from "next/link";
import type { Booking, LessonPlan, TargetRef } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { planOfBooking, sameTarget } from "@/lib/selectors";
import { formatDate, formatDateTime, formatRange } from "@/lib/time";

export const PLAN_FIELDS: { key: keyof Pick<LessonPlan, "purpose" | "content" | "checks" | "tools" | "memo">; label: string; placeholder: string }[] = [
  { key: "purpose", label: "今回の目的・テーマ", placeholder: "例：リリースの安定" },
  { key: "content", label: "大まかな指導内容", placeholder: "例：タオルシャドー → ネットスロー → 動画確認" },
  { key: "checks", label: "確認したいこと", placeholder: "例：自主練習（タオルシャドー）を続けられたか" },
  { key: "tools", label: "準備する道具", placeholder: "例：タオル、ネット、スピードガン" },
  { key: "memo", label: "自由メモ", placeholder: "短いメモだけでも保存できます" },
];

export function planHref(bookingId: string): string {
  return `/plan?booking=${encodeURIComponent(bookingId)}`;
}

/** 保存済みのメモの内容（入力された項目だけ） */
export function PlanFields({ plan }: { plan: LessonPlan }) {
  const filled = PLAN_FIELDS.filter((f) => plan[f.key].trim());
  return (
    <dl className="fields">
      {filled.map((f) => (
        <div key={f.key} style={{ display: "contents" }}>
          <dt>{f.label}</dt>
          <dd>{plan[f.key]}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 予約ごとのメモ表示（なければ作成ボタン） */
export function PlanCard({ booking, compact = false }: { booking: Booking; compact?: boolean }) {
  const { data } = useApp();
  const plan = planOfBooking(data, booking.id);
  if (!plan) {
    return (
      <div className="empty" style={{ textAlign: "left" }}>
        <p style={{ marginBottom: 8 }}>{formatRange(booking.start, booking.end)} の指導メモはまだありません</p>
        {booking.status === "scheduled" && (
          <Link href={planHref(booking.id)} className="btn btn-sm btn-primary">
            今回の指導内容をメモ
          </Link>
        )}
      </div>
    );
  }
  const moved = plan.bookingStartAtSave !== booking.start;
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <strong className="small">
          {formatRange(booking.start, booking.end)} の指導メモ
        </strong>
        <Link href={planHref(booking.id)} className="btn btn-sm">
          編集
        </Link>
      </div>
      {moved && (
        <p className="xs" style={{ marginBottom: 8 }}>
          <span className="badge badge-warning">! 保存後に予約日時が変更されています（保存時：{formatDateTime(plan.bookingStartAtSave)}）</span>
        </p>
      )}
      {!compact && <PlanFields plan={plan} />}
      {compact && <p className="small pre">{plan.purpose || plan.content || plan.memo || plan.checks || plan.tools}</p>}
      <p className="xs muted" style={{ marginTop: 8 }}>
        最終更新 {formatDateTime(plan.updatedAt)}
      </p>
    </div>
  );
}

/** 項目ごとの最新の測定結果 */
export function LatestMeasurements({ target, beforeISO }: { target: TargetRef; beforeISO?: string }) {
  const { data } = useApp();
  const before = beforeISO?.slice(0, 10);
  const latest = new Map<string, { item: string; unit: string; value: number; date: string }>();
  for (const m of data.measurements) {
    if (!sameTarget(m.target, target)) continue;
    if (before && m.date >= before) continue;
    const key = `${m.item}（${m.unit}）`;
    const cur = latest.get(key);
    if (!cur || m.date > cur.date) latest.set(key, m);
  }
  if (latest.size === 0) return <p className="small muted">測定結果の記録はありません</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>項目</th>
            <th className="num">最新の値</th>
            <th>測定日</th>
          </tr>
        </thead>
        <tbody>
          {[...latest.values()].map((m) => (
            <tr key={m.item + m.unit}>
              <td>{m.item}</td>
              <td className="num">
                {m.value} {m.unit}
              </td>
              <td>{formatDate(m.date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
