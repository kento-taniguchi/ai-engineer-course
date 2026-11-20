// 月の集計・請求額の計算（画面や保存先に依存しない処理）
import { UNIT_PRICES } from "@/config";
import { compareMembers, isScheduledOn } from "./members";
import { daysInMonth, monthOf } from "./dates";
import type { DateKey, DayRecord, Member, MonthKey } from "./types";

/** その月に適用する1回あたりの単価 */
export function unitPriceFor(ym: MonthKey): number {
  const sorted = [...UNIT_PRICES].sort((a, b) => a.from.localeCompare(b.from));
  let price = sorted[0]?.price ?? 0;
  for (const p of sorted) if (p.from <= ym) price = p.price;
  return price;
}

export type MonthRow = {
  member: Member;
  /** 利用した日（「利用」で保存された日だけ） */
  usedDates: DateKey[];
  count: number;
  unitPrice: number;
  amount: number;
  /** 未確認のまま保存されている日 */
  unconfirmedDates: DateKey[];
};

export type MonthSummary = {
  ym: MonthKey;
  unitPrice: number;
  rows: MonthRow[];
  totalCount: number;
  totalAmount: number;
  /** 通常の利用日なのに、まだ出欠を保存していない日（今日まで） */
  unsavedDates: DateKey[];
};

export function summarizeMonth(members: Member[], records: DayRecord[], ym: MonthKey, today: DateKey): MonthSummary {
  const unitPrice = unitPriceFor(ym);
  const inMonth = records.filter((r) => monthOf(r.date) === ym);
  const used = new Map<string, DateKey[]>();
  const unconfirmed = new Map<string, DateKey[]>();
  for (const rec of inMonth) {
    for (const e of rec.entries) {
      const target = e.status === "present" ? used : e.status === "unconfirmed" ? unconfirmed : null;
      if (!target) continue;
      target.set(e.memberId, [...(target.get(e.memberId) ?? []), rec.date]);
    }
  }
  const recordedIds = new Set(inMonth.flatMap((r) => r.entries.map((e) => e.memberId)));
  const monthDays = daysInMonth(ym);
  // 表示する会員：その月に記録がある会員 ＋ その月に利用予定があった会員
  const shown = members.filter(
    (m) => recordedIds.has(m.id) || monthDays.some((d) => isScheduledOn(m, d)),
  );
  const rows: MonthRow[] = shown.sort(compareMembers).map((member) => {
    const usedDates = [...(used.get(member.id) ?? [])].sort();
    return {
      member,
      usedDates,
      count: usedDates.length,
      unitPrice,
      amount: usedDates.length * unitPrice,
      unconfirmedDates: [...(unconfirmed.get(member.id) ?? [])].sort(),
    };
  });
  const savedDates = new Set(inMonth.map((r) => r.date));
  const unsavedDates = monthDays.filter(
    (d) => d <= today && !savedDates.has(d) && members.some((m) => isScheduledOn(m, d)),
  );
  return {
    ym,
    unitPrice,
    rows,
    totalCount: rows.reduce((s, r) => s + r.count, 0),
    totalAmount: rows.reduce((s, r) => s + r.amount, 0),
    unsavedDates,
  };
}

export const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;
