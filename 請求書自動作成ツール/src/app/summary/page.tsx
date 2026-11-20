"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { summarizeMonth, yen, type MonthSummary } from "@/lib/billing";
import { addMonths, formatDateShort, formatMonth, monthOf, parseKey, todayKey } from "@/lib/dates";
import { getRepository } from "@/services/repository";

const repo = getRepository();

export default function SummaryPage() {
  const [ym, setYm] = useState("");
  const [summary, setSummary] = useState<MonthSummary | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("ym");
    setYm(q && /^\d{4}-\d{2}$/.test(q) ? q : monthOf(todayKey()));
  }, []);

  useEffect(() => {
    if (!ym) return;
    let alive = true;
    (async () => {
      const [members, days] = await Promise.all([repo.listMembers(), repo.listDaysInMonth(ym)]);
      if (alive) setSummary(summarizeMonth(members, days, ym, todayKey()));
    })();
    window.history.replaceState(null, "", `?ym=${ym}`);
    return () => {
      alive = false;
    };
  }, [ym]);

  if (!ym || !summary) return null;
  const billable = summary.rows.filter((r) => r.count > 0);
  const unconfirmedCount = summary.rows.reduce((s, r) => s + r.unconfirmedDates.length, 0);

  return (
    <>
      <div className="month-bar">
        <button className="btn" onClick={() => setYm(addMonths(ym, -1))} aria-label="前の月">◀ 前の月</button>
        <span className="month-label">{formatMonth(ym)}</span>
        <button className="btn" onClick={() => setYm(addMonths(ym, 1))} aria-label="次の月">次の月 ▶</button>
        <div className="spacer" />
        <Link className="btn btn-primary" href={`/invoices?ym=${ym}`} style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }} aria-disabled={billable.length === 0}>
          全員分の請求書（{billable.length}名）
        </Link>
      </div>

      {(summary.unsavedDates.length > 0 || unconfirmedCount > 0) && (
        <div className="notice">
          {summary.unsavedDates.length > 0 && (
            <div>出欠を保存していない日：{summary.unsavedDates.map(formatDateShort).join("、")}</div>
          )}
          {unconfirmedCount > 0 && (
            <div>
              未確認のままの記録：
              {summary.rows
                .filter((r) => r.unconfirmedDates.length)
                .map((r) => `${r.member.name}（${r.unconfirmedDates.map(formatDateShort).join("、")}）`)
                .join("、")}
            </div>
          )}
        </div>
      )}

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>氏名</th>
              <th>利用日</th>
              <th className="num">回数</th>
              <th className="num">金額</th>
              <th className="no-print"></th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((r) => (
              <tr key={r.member.id} className={r.count === 0 ? "zero" : ""}>
                <td>
                  {r.member.name}
                  <div className="muted small">
                    {r.member.id}
                    {r.member.withdrawnOn && <span className="tag">退会</span>}
                  </div>
                </td>
                <td className="days">{r.usedDates.map((d) => parseKey(d).d).join("、") || "—"}</td>
                <td className="num">{r.count}回</td>
                <td className="num">{yen(r.amount)}</td>
                <td>
                  {r.count > 0 && (
                    <Link className="btn btn-small" href={`/invoices?ym=${ym}&member=${r.member.id}`} style={{ textDecoration: "none", display: "inline-block" }}>
                      請求書
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {summary.rows.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">この月の記録はありません</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>合計（単価 {yen(summary.unitPrice)}）</td>
              <td className="num">{summary.totalCount}回</td>
              <td className="num">{yen(summary.totalAmount)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
