// 出欠の記録（画面や保存先に依存しない処理）
import { compareMembers, currentSlot, isScheduledOn } from "./members";
import type { AttendanceStatus, DateKey, DayEntry, DayRecord, Member, TimeSlot } from "./types";

export type DayRow = {
  member: Member;
  /** 通常の曜日として表示されている */
  scheduled: boolean;
  /** その日だけ追加した（振替など） */
  added: boolean;
};

/**
 * その日の一覧に出す会員。
 * ①通常の利用曜日の会員 ②保存済みの記録にある会員 ③その日だけ追加した会員
 * 保存済みの記録は曜日変更・退会後もそのまま表示します。
 */
export function buildDayRows(members: Member[], date: DateKey, saved: DayRecord | null, extraIds: string[] = []): DayRow[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  const rows = new Map<string, DayRow>();
  for (const m of members) {
    if (isScheduledOn(m, date)) rows.set(m.id, { member: m, scheduled: true, added: false });
  }
  for (const e of saved?.entries ?? []) {
    const m = byId.get(e.memberId);
    if (!m || rows.has(m.id)) continue;
    rows.set(m.id, { member: m, scheduled: !e.added, added: e.added });
  }
  for (const id of extraIds) {
    const m = byId.get(id);
    if (!m || rows.has(id)) continue;
    rows.set(id, { member: m, scheduled: false, added: true });
  }
  return [...rows.values()].sort((a, b) => compareMembers(a.member, b.member));
}

/** 時間帯ごとに分ける（午前 → 午後の順。だれもいない時間帯は出さない） */
export function groupBySlot(rows: DayRow[], date: DateKey, order: readonly TimeSlot[]): { slot: TimeSlot; rows: DayRow[] }[] {
  return order
    .map((slot) => ({ slot, rows: rows.filter((r) => currentSlot(r.member, date) === slot) }))
    .filter((g) => g.rows.length > 0);
}

/** 追加できる会員（その日の一覧にいない、退会していない会員） */
export function addableMembers(members: Member[], rows: DayRow[], date: DateKey): Member[] {
  const shown = new Set(rows.map((r) => r.member.id));
  return members
    .filter((m) => !shown.has(m.id) && !(m.withdrawnOn !== null && m.withdrawnOn <= date))
    .sort(compareMembers);
}

export type Draft = Record<string, AttendanceStatus>;

export function draftFromRecord(rec: DayRecord | null): Draft {
  const d: Draft = {};
  for (const e of rec?.entries ?? []) d[e.memberId] = e.status;
  return d;
}

export const statusOf = (draft: Draft, memberId: string): AttendanceStatus => draft[memberId] ?? "unconfirmed";

/** 全員利用：欠席の方を利用に変えるかは overwriteAbsent で指定 */
export function markAllPresent(draft: Draft, rows: DayRow[], overwriteAbsent: boolean): Draft {
  const next = { ...draft };
  for (const r of rows) {
    const s = statusOf(draft, r.member.id);
    if (s === "absent" && !overwriteAbsent) continue;
    next[r.member.id] = "present";
  }
  return next;
}

/** 全員利用を押したとき、確認が必要な（欠席になっている）会員 */
export function absentRows(draft: Draft, rows: DayRow[]): DayRow[] {
  return rows.filter((r) => statusOf(draft, r.member.id) === "absent");
}

export function toRecord(date: DateKey, rows: DayRow[], draft: Draft, nowIso = new Date().toISOString()): DayRecord {
  const entries: DayEntry[] = rows.map((r) => ({
    memberId: r.member.id,
    status: statusOf(draft, r.member.id),
    added: r.added,
  }));
  return { date, entries, savedAt: nowIso };
}

/** 保存済みの内容と、画面上の内容が違うか */
export function isDirty(saved: DayRecord | null, rows: DayRow[], draft: Draft): boolean {
  const savedMap = new Map((saved?.entries ?? []).map((e) => [e.memberId, e]));
  for (const r of rows) {
    const s = statusOf(draft, r.member.id);
    const e = savedMap.get(r.member.id);
    if (!e) {
      // 保存されていない行：追加した行、または何か選択した行は未保存扱い
      if (r.added || s !== "unconfirmed") return true;
      continue;
    }
    if (e.status !== s) return true;
  }
  return false;
}

export function countStatuses(rows: DayRow[], draft: Draft) {
  const c = { present: 0, absent: 0, unconfirmed: 0 };
  for (const r of rows) c[statusOf(draft, r.member.id)]++;
  return c;
}
