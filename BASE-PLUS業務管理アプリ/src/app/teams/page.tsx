"use client";

import Link from "next/link";
import { useApp } from "@/store/AppStore";
import { lastBooking, nextBooking } from "@/lib/selectors";
import { formatDate, dateKeyOf, formatYen } from "@/lib/time";
import { DemoBar, PageHead } from "@/components/ui";

export default function TeamsPage() {
  const { data, now } = useApp();
  return (
    <>
      <PageHead title="チーム" sub={`${data.teams.length}チーム（架空）`} />
      <DemoBar>チームはすべて架空です。</DemoBar>
      <ul className="list">
        {data.teams.map((t) => {
          const target = { type: "team" as const, id: t.id };
          const last = lastBooking(data, target, now);
          const next = nextBooking(data, target, now);
          return (
            <li key={t.id}>
              <Link href={`/teams/${t.id}`} className="list-link">
                <div className="list-main">
                  <div>
                    <strong>{t.name}</strong> <span className="small muted">{t.category}</span>
                  </div>
                  <div className="small muted">
                    契約：月{t.contract.visitsPerMonth}回・{formatYen(t.contract.monthlyFee)}／月 ・ 前回：
                    {last ? formatDate(dateKeyOf(last.start)) : "記録なし"} ／ 次回：{next ? formatDate(dateKeyOf(next.start)) : "予定なし"}
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
    </>
  );
}
