"use client";

import { useState } from "react";
import type { SalesItem, SalesService, SalesStatus } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { addMonthsKey, formatMonth, formatYen, monthKey } from "@/lib/time";
import { HBarChart, ShareBar } from "@/components/charts";
import { DemoBar, PageHead } from "@/components/ui";

const SERVICE: Record<SalesService, { label: string; color: string; icon: string }> = {
  personal: { label: "対面パーソナル", color: "#1b2a4a", icon: "●" },
  online: { label: "オンライン", color: "#4f6aa3", icon: "◆" },
  team: { label: "チームサポート", color: "#b08a35", icon: "■" },
  seminar: { label: "セミナー", color: "#7a8699", icon: "▲" },
  other: { label: "体験・その他", color: "#9aa3b2", icon: "▲" },
};

const STATUS: Record<SalesStatus, { label: string; cls: string; icon: string }> = {
  planned: { label: "予定", cls: "badge-off", icon: "○" },
  done: { label: "実施確認", cls: "badge-info", icon: "◑" },
  paid: { label: "入金確認", cls: "badge-ok", icon: "✓" },
  cancelled: { label: "キャンセル", cls: "badge-danger", icon: "×" },
  moved: { label: "振替", cls: "badge-warning", icon: "→" },
};

function summarize(items: SalesItem[]) {
  const active = items.filter((i) => i.status !== "cancelled" && i.status !== "moved");
  const sum = (list: SalesItem[]) => list.reduce((s, i) => s + i.amount, 0);
  return {
    planned: sum(active),
    done: sum(active.filter((i) => i.status === "done" || i.status === "paid")),
    paid: sum(active.filter((i) => i.status === "paid")),
    byService: (Object.keys(SERVICE) as SalesService[]).map((s) => ({
      service: s,
      planned: sum(active.filter((i) => i.service === s)),
      paid: sum(active.filter((i) => i.service === s && i.status === "paid")),
    })),
  };
}

function diffLabel(cur: number, prev: number): string {
  const d = cur - prev;
  const pct = prev ? Math.round((d / prev) * 100) : null;
  return `${d >= 0 ? "＋" : "－"}${formatYen(Math.abs(d))}${pct !== null ? `（${d >= 0 ? "+" : ""}${pct}%）` : ""}`;
}

export default function SalesPage() {
  const { data, now, update } = useApp();
  const [mk, setMk] = useState(monthKey(now));
  const prevMk = addMonthsKey(mk, -1);
  const items = data.sales.filter((s) => s.month === mk);
  const cur = summarize(items);
  const prev = summarize(data.sales.filter((s) => s.month === prevMk));
  const services = cur.byService.filter((s) => s.planned > 0 || prev.byService.find((p) => p.service === s.service)!.planned > 0);

  return (
    <>
      <PageHead title="売上" sub="予定額と、実施・入金を確認した金額を分けて表示します" />
      <DemoBar>架空の売上データです。会計処理が完了したことを示すものではありません。</DemoBar>

      <div className="row section" style={{ marginBottom: 16 }}>
        <button className="btn btn-sm" onClick={() => setMk(addMonthsKey(mk, -1))}>
          ‹ 前月
        </button>
        <h2 style={{ minWidth: 140, textAlign: "center" }}>{formatMonth(mk)}</h2>
        <button className="btn btn-sm" onClick={() => setMk(addMonthsKey(mk, 1))}>
          翌月 ›
        </button>
      </div>

      <div className="grid-3 section">
        <div className="card stat">
          <span className="stat-label">予定額（キャンセル・振替を除く）</span>
          <span className="stat-value">{formatYen(cur.planned)}</span>
          <span className="xs muted">先月比 {diffLabel(cur.planned, prev.planned)}</span>
        </div>
        <div className="card stat">
          <span className="stat-label">実施確認済み</span>
          <span className="stat-value">{formatYen(cur.done)}</span>
          <span className="xs muted">先月 {formatYen(prev.done)}</span>
        </div>
        <div className="card stat">
          <span className="stat-label">入金確認済み</span>
          <span className="stat-value">{formatYen(cur.paid)}</span>
          <span className="xs muted">先月比 {diffLabel(cur.paid, prev.paid)}</span>
        </div>
      </div>

      <div className="grid-2 section">
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>サービス別の内訳</h3>
          <HBarChart
            format={formatYen}
            data={services.map((s) => ({
              label: `${SERVICE[s.service].icon} ${SERVICE[s.service].label}`,
              values: [
                { key: "今月予定", value: s.planned, color: SERVICE[s.service].color, pattern: true },
                { key: "今月入金", value: s.paid, color: SERVICE[s.service].color },
                { key: "先月予定", value: prev.byService.find((p) => p.service === s.service)!.planned, color: "#c3c9d4" },
              ],
            }))}
          />
          <p className="xs muted" style={{ marginTop: 12 }}>
            斜線＝予定額、塗りつぶし＝入金確認済み、灰色＝先月の予定額
          </p>
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>サービス別の割合（予定額）</h3>
          <ShareBar parts={cur.byService.filter((s) => s.planned > 0).map((s) => ({ label: SERVICE[s.service].label, value: s.planned, color: SERVICE[s.service].color, icon: SERVICE[s.service].icon }))} />
          <div className="notice notice-info xs" style={{ marginTop: 16 }}>
            チームの月額契約は、訪問回数に関係なく1か月1件で計上しています。予約をキャンセルすると、その売上は「キャンセル」になり予定額から外れます。
          </div>
        </div>
      </div>

      <section className="section" aria-labelledby="h-sales-list">
        <h2 id="h-sales-list" style={{ marginBottom: 8 }}>
          明細（{items.length}件）
        </h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>内容</th>
                <th>サービス</th>
                <th className="num">金額</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    この月のデータはありません
                  </td>
                </tr>
              )}
              {items
                .slice()
                .sort((a, b) => a.service.localeCompare(b.service) || a.description.localeCompare(b.description))
                .map((i) => (
                  <tr key={i.id}>
                    <td>
                      {i.description}
                      {i.source.type === "contract" && <span className="badge badge-kind" style={{ marginLeft: 4 }}>月額</span>}
                      {i.movedTo && <span className="xs muted">（{formatMonth(i.movedTo)}へ）</span>}
                    </td>
                    <td>
                      <span aria-hidden="true">{SERVICE[i.service].icon}</span> {SERVICE[i.service].label}
                    </td>
                    <td className="num" style={{ textDecoration: i.status === "cancelled" || i.status === "moved" ? "line-through" : undefined }}>
                      {formatYen(i.amount)}
                    </td>
                    <td>
                      <label className="sr-only" htmlFor={`st-${i.id}`}>
                        状態
                      </label>
                      <select
                        id={`st-${i.id}`}
                        value={i.status}
                        onChange={(e) => update((d) => ({ ...d, sales: d.sales.map((s) => (s.id === i.id ? { ...s, status: e.target.value as SalesStatus } : s)) }), "状態を変更しました")}
                        style={{ minHeight: 32, padding: "2px 8px", fontSize: 13, width: "auto" }}
                      >
                        {(Object.keys(STATUS) as SalesStatus[]).map((s) => (
                          <option key={s} value={s}>
                            {STATUS[s].icon} {STATUS[s].label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
