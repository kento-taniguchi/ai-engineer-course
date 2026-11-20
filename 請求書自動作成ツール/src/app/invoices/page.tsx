"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { OFFICE } from "@/config";
import { summarizeMonth, yen, type MonthRow } from "@/lib/billing";
import { formatDateShort, formatMonth, isMonthKey, monthOf, parseKey, todayKey } from "@/lib/dates";
import { getRepository } from "@/services/repository";

const repo = getRepository();

/** 請求書（利用者ごとに1ページ）。?ym=YYYY-MM で月、&member=会員ID で1名分 */
export default function InvoicesPage() {
  const [ym, setYm] = useState("");
  const [memberId, setMemberId] = useState<string | null>(null);
  const [rows, setRows] = useState<MonthRow[] | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const m = q.get("ym") ?? "";
    const month = isMonthKey(m) ? m : monthOf(todayKey());
    const id = q.get("member");
    setYm(month);
    setMemberId(id);
    (async () => {
      const [members, days] = await Promise.all([repo.listMembers(), repo.listDaysInMonth(month)]);
      const s = summarizeMonth(members, days, month, todayKey());
      setRows(s.rows.filter((r) => r.count > 0 && (!id || r.member.id === id)));
    })();
  }, []);

  if (!rows) return null;
  const issued = todayKey();

  return (
    <>
      <div className="print-toolbar no-print">
        <Link className="btn" href={`/summary?ym=${ym}`} style={{ textDecoration: "none" }}>
          ◀ 集計に戻る
        </Link>
        <span className="muted">
          {formatMonth(ym)}分　{memberId ? "1名分" : `${rows.length}名分`}
        </span>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => window.print()} disabled={rows.length === 0}>
          印刷・PDF保存
        </button>
      </div>

      {rows.length === 0 && <div className="card empty no-print">この月に利用した記録がありません</div>}

      {rows.map((r) => (
        <Invoice key={r.member.id} row={r} ym={ym} issued={issued} />
      ))}
    </>
  );
}

function Invoice({ row, ym, issued }: { row: MonthRow; ym: string; issued: string }) {
  const iss = parseKey(issued);
  return (
    <section className="invoice">
      {OFFICE.isDemo && <div className="demo-stamp">デモ用・架空</div>}
      <h1>請求書</h1>
      <div className="inv-head">
        <div className="inv-to">{row.member.name} 様</div>
        <div className="inv-meta">
          <div>発行日：{iss.y}年{iss.m}月{iss.d}日</div>
          <div>会員番号：{row.member.id}</div>
          <div className="inv-office">
            <strong>{OFFICE.name}</strong>
            <br />
            {OFFICE.address}
            <br />
            TEL {OFFICE.tel}
          </div>
        </div>
      </div>

      <p style={{ marginTop: 20 }}>下記のとおりご請求申し上げます。</p>
      <div className="inv-total">
        <span>ご請求金額</span>
        <span className="amount">{yen(row.amount)}</span>
      </div>

      <table className="inv-table">
        <thead>
          <tr>
            <th>対象月</th>
            <th>内容</th>
            <th>利用回数</th>
            <th>単価</th>
            <th>金額</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{formatMonth(ym)}</td>
            <td>サービス利用料</td>
            <td className="num">{row.count}回</td>
            <td className="num">{yen(row.unitPrice)}</td>
            <td className="num">{yen(row.amount)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontWeight: 600, marginBottom: 6 }}>ご利用日（{row.count}日）</div>
      <div className="inv-dates">
        {row.usedDates.map((d) => (
          <span key={d}>{formatDateShort(d)}</span>
        ))}
      </div>
    </section>
  );
}
