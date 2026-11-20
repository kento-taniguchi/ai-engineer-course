// 会員の登録・変更・退会（画面や保存先に依存しない処理）
import { monthOf, weekdayOf } from "./dates";
import type { CopayEntry, CopayRatio, DateKey, Member, MonthKey } from "./types";

const normWeekdays = (w: number[]) => [...new Set(w)].filter((n) => n >= 0 && n <= 6).sort((a, b) => a - b);

/** 次の会員ID（M0001, M0002, ...）。退会者も含めて重複しない */
export function nextMemberId(members: Member[]): string {
  const max = members.reduce((acc, m) => {
    const n = Number(m.id.replace(/^M/, ""));
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);
  return `M${String(max + 1).padStart(4, "0")}`;
}

export function createMember(
  members: Member[],
  input: { name: string; kana?: string; weekdays: number[]; from: DateKey; copayRatio?: CopayRatio },
  nowIso = new Date().toISOString(),
): Member {
  const name = input.name.trim();
  if (!name) throw new Error("氏名を入力してください");
  const weekdays = normWeekdays(input.weekdays);
  if (weekdays.length === 0) throw new Error("利用曜日を1つ以上選んでください");
  const ratio = input.copayRatio ?? 1;
  if (!isCopayRatio(ratio)) throw new Error("負担割合は1割・2割・3割から選んでください");
  return {
    id: nextMemberId(members),
    name,
    kana: (input.kana ?? "").trim(),
    schedules: [{ from: input.from, weekdays }],
    copays: [{ from: monthOf(input.from), ratio }],
    withdrawnOn: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function renameMember(m: Member, name: string, kana: string, nowIso = new Date().toISOString()): Member {
  const n = name.trim();
  if (!n) throw new Error("氏名を入力してください");
  return { ...m, name: n, kana: kana.trim(), updatedAt: nowIso };
}

/**
 * 利用曜日の変更（from の日から新しい曜日）。
 * 変更前の期間の設定は残すので、過去の日付の利用予定・保存済みの記録は変わりません。
 * 同じ開始日の設定がすでにあれば置き換え、それより後に始まる設定は取り消します。
 */
export function changeSchedule(m: Member, weekdays: number[], from: DateKey, nowIso = new Date().toISOString()): Member {
  const w = normWeekdays(weekdays);
  if (w.length === 0) throw new Error("利用曜日を1つ以上選んでください");
  const kept = m.schedules.filter((s) => s.from < from);
  return { ...m, schedules: [...kept, { from, weekdays: w }], updatedAt: nowIso };
}

export function withdrawMember(m: Member, on: DateKey, nowIso = new Date().toISOString()): Member {
  return { ...m, withdrawnOn: on, updatedAt: nowIso };
}

export function restoreMember(m: Member, nowIso = new Date().toISOString()): Member {
  return { ...m, withdrawnOn: null, updatedAt: nowIso };
}

/** その日に有効な利用曜日（設定開始前なら空） */
export function weekdaysOn(m: Member, date: DateKey): number[] {
  let cur: number[] = [];
  for (const s of [...m.schedules].sort((a, b) => a.from.localeCompare(b.from))) {
    if (s.from <= date) cur = s.weekdays;
  }
  return cur;
}

/** 現在（または指定日）の利用曜日 */
export function currentWeekdays(m: Member, date: DateKey): number[] {
  const w = weekdaysOn(m, date);
  if (w.length) return w;
  // まだ始まっていない設定しかない場合は、最初の設定を表示用に返す
  return m.schedules[0]?.weekdays ?? [];
}

/** 予定されている将来の曜日変更（指定日より後に始まるもの） */
export function upcomingSchedules(m: Member, date: DateKey) {
  return m.schedules.filter((s) => s.from > date);
}

export function isWithdrawnOn(m: Member, date: DateKey): boolean {
  return m.withdrawnOn !== null && m.withdrawnOn <= date;
}

/** その日が通常の利用日か（退会日以降は対象外） */
export function isScheduledOn(m: Member, date: DateKey): boolean {
  if (isWithdrawnOn(m, date)) return false;
  return weekdaysOn(m, date).includes(weekdayOf(date));
}

/** 一覧の並び順：ふりがな → 氏名 → 会員ID */
export function compareMembers(a: Member, b: Member): number {
  return (
    (a.kana || a.name).localeCompare(b.kana || b.name, "ja") ||
    a.name.localeCompare(b.name, "ja") ||
    a.id.localeCompare(b.id)
  );
}

// ---- 介護保険の自己負担割合 ----

/** 負担割合が未設定の古いデータは「1割」として扱います */
export const DEFAULT_COPAY: CopayEntry = { from: "2000-01", ratio: 1 };

export function isCopayRatio(v: unknown): v is CopayRatio {
  return v === 1 || v === 2 || v === 3;
}

/** 保存先から読んだ会員データの形をそろえる（負担割合がない古いデータに1割を入れる） */
export function normalizeMember(m: Member): Member {
  const copays = Array.isArray(m.copays) ? m.copays.filter((c) => c && typeof c.from === "string" && isCopayRatio(c.ratio)) : [];
  return { ...m, copays: copays.length ? copays : [DEFAULT_COPAY] };
}

/** その月の負担割合（設定開始前の月なら、最初の設定を使う） */
export function copayRatioFor(m: Member, ym: MonthKey): CopayRatio {
  const sorted = [...(m.copays ?? [])].sort((a, b) => a.from.localeCompare(b.from));
  let ratio: CopayRatio = sorted[0]?.ratio ?? DEFAULT_COPAY.ratio;
  for (const c of sorted) if (c.from <= ym) ratio = c.ratio;
  return ratio;
}

/**
 * 負担割合の変更（from の月の分から新しい割合）。
 * それより前の月の設定は残すので、過去の月の請求額は変わりません。
 * 同じ月以降に始まる設定は置き換え（取り消し）ます。
 */
export function changeCopay(m: Member, ratio: CopayRatio, from: MonthKey, nowIso = new Date().toISOString()): Member {
  if (!isCopayRatio(ratio)) throw new Error("負担割合は1割・2割・3割から選んでください");
  const kept = (m.copays ?? []).filter((c) => c.from < from);
  return { ...m, copays: [...kept, { from, ratio }], updatedAt: nowIso };
}

/** 予定されている将来の負担割合の変更（指定月より後に始まるもの） */
export function upcomingCopays(m: Member, ym: MonthKey): CopayEntry[] {
  return (m.copays ?? []).filter((c) => c.from > ym).sort((a, b) => a.from.localeCompare(b.from));
}
