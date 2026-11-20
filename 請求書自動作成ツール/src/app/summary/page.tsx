"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { WEEKDAY_LABELS } from "@/config";
import { buildAttendanceSheet, MARK, toCsv } from "@/lib/attendanceSheet";
import { summarizeMonth, yen, type MonthSummary } from "@/lib/billing";
import { addMonths, daysInMonth, formatDateShort, formatMonth, monthOf, parseKey, todayKey, weekdayOf } from "@/lib/dates";
import { buildSpreadsheetRequest } from "@/lib/googleSheets";
import { createSpreadsheet, isGoogleConfigured, loadGoogleIdentity } from "@/services/googleSheetsExport";
import { OFFICE } from "@/config";
import { getRepository } from "@/services/repository";

const repo = getRepository();

/** ブラウザでファイルをダウンロードさせる（データはこのパソコンの外に送りません） */
function download(data: BlobPart, type: string, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function SummaryPage() {
  const [ym, setYm] = useState("");
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [sheetState, setSheetState] = useState<{ kind: "idle" } | { kind: "saving" } | { kind: "done"; url: string; ym: string }>({ kind: "idle" });

  // Google のログイン部品を先に読み込んでおく（ボタンを押したときにログイン画面がブロックされないように）
  useEffect(() => {
    if (isGoogleConfigured()) loadGoogleIdentity().catch(() => {});
  }, []);

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
  const fileBase = `出欠表_${formatMonth(ym)}`;
  const saveCsv = () => download(toCsv(buildAttendanceSheet(summary)), "text/csv;charset=utf-8", `${fileBase}.csv`);
  const saveSheet = async () => {
    setSheetState({ kind: "saving" });
    try {
      const request = buildSpreadsheetRequest(buildAttendanceSheet(summary), {
        fileTitle: `${fileBase}（${OFFICE.name}）`,
        sheetTitle: formatMonth(ym),
      });
      const url = await createSpreadsheet(request);
      setSheetState({ kind: "done", url, ym });
    } catch (e) {
      setSheetState({ kind: "idle" });
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

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
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="muted small">出欠表（縦＝会員、横＝日付、利用した日に○）をファイルに保存：</span>
        <button
          className="btn btn-small btn-primary"
          onClick={saveSheet}
          disabled={summary.rows.length === 0 || sheetState.kind === "saving" || !isGoogleConfigured()}
        >
          {sheetState.kind === "saving" ? "作成中…" : "Googleスプレッドシートに保存"}
        </button>
        <button className="btn btn-small" onClick={saveCsv} disabled={summary.rows.length === 0}>
          CSVで保存
        </button>
        {!isGoogleConfigured() && <span className="small muted">※ スプレッドシートに保存するには Google 連携の設定が必要です（README 参照）</span>}
        {sheetState.kind === "done" && sheetState.ym === ym && (
          <a className="small" href={sheetState.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700 }}>
            ✓ 作成しました：スプレッドシートを開く
          </a>
        )}
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
              <th>負担割合</th>
              <th>利用日</th>
              <th className="num">回数</th>
              <th className="num">単価</th>
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
                <td>{r.ratio}割</td>
                <td className="days">{r.usedDates.map((d) => parseKey(d).d).join("、") || "—"}</td>
                <td className="num">{r.count}回</td>
                <td className="num">{yen(r.unitPrice)}</td>
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
                <td colSpan={7} className="empty">この月の記録はありません</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>合計</td>
              <td className="num">{summary.totalCount}回</td>
              <td></td>
              <td className="num">{yen(summary.totalAmount)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <AttendanceMatrix summary={summary} />
    </>
  );
}

/** 出欠表（縦＝会員、横＝日付）。横にスクロールしても氏名の列は固定 */
function AttendanceMatrix({ summary }: { summary: MonthSummary }) {
  const days = daysInMonth(summary.ym);
  if (summary.rows.length === 0) return null;
  return (
    <section className="section">
      <h2>出欠表（○＝利用）</h2>
      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th className="sticky-col">氏名</th>
              {days.map((d) => {
                const w = weekdayOf(d);
                return (
                  <th key={d} className={w === 0 ? "sun" : w === 6 ? "sat" : ""}>
                    {parseKey(d).d}
                    <div className="wd">{WEEKDAY_LABELS[w]}</div>
                  </th>
                );
              })}
              <th className="count">回数</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((r) => {
              const used = new Set(r.usedDates);
              return (
                <tr key={r.member.id}>
                  <th className="sticky-col" scope="row">
                    {r.member.name}
                    <div className="muted small">{r.member.id}</div>
                  </th>
                  {days.map((d) => (
                    <td key={d}>{used.has(d) ? MARK : ""}</td>
                  ))}
                  <td className="count">{r.count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
