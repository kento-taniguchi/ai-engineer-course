// Googleカレンダーの予定と、アプリの予約・ToDoを突き合わせる処理（画面・通信から分離）。
//
// 方針
//  - 予定を予約に紐づけるのは本人の操作だけ（候補は出すが自動で断定しない）。
//    例外：本人が「この繰り返し予定のほかの回も同じ対象者にする」を選んだ繰り返し予定
//  - 予約IDは「カレンダー＋予定ID」から決まるので、何度読み込んでも予約・ToDoは重複しない
//  - 日時変更 → 予約の日時を更新し、変更内容をお知らせとして表示（未完了ToDoは新しい日時に追従）
//  - 削除・キャンセル・見つからない → 予約を「削除」状態にし、未完了ToDoは「確認が必要」に（自動で対象外にしない）
//  - 作成済みのレポート・指導メモ・完了履歴は削除しない

import type { AppData, Booking, BookingKind, DateKey, GCalEvent, GoogleState, TargetRef } from "./types";
import { deleteBooking, rescheduleBooking, restoreBooking } from "./operations";
import { ensureTodos } from "./todoEngine";
import { formatRange, toISO } from "./time";
import { sameTarget, targetName } from "./selectors";

export function eventKey(e: { calendarId: string; eventId: string }): string {
  return `${e.calendarId}|${e.eventId}`;
}

function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(36);
}

/** Googleの予定に対応する予約ID（同じ予定なら常に同じID） */
export function bookingIdForEvent(calendarId: string, eventId: string): string {
  return `g-${shortHash(calendarId)}-${eventId}`;
}

export function linkedBooking(data: AppData, e: { calendarId: string; eventId: string }): Booking | undefined {
  return data.bookings.find((b) => b.id === bookingIdForEvent(e.calendarId, e.eventId));
}

export interface SyncSummary {
  fetched: number;
  autoLinked: number;
  rescheduled: string[];
  removed: string[];
  restored: string[];
}

/** 読み込み結果を反映する */
export function applySyncResult(
  data: AppData,
  fetched: { calendarId: string; events: GCalEvent[] }[],
  range: { from: DateKey; to: DateKey },
  now: Date,
  /** 期間内に見つからなかった紐づけ済みの予定を個別に確認した結果（期間外へ移動した予定など）。照合だけに使い、控えには入れない */
  checked: GCalEvent[] = [],
): { data: AppData; summary: SyncSummary } {
  const summary: SyncSummary = { fetched: 0, autoLinked: 0, rescheduled: [], removed: [], restored: [] };
  const fetchedCals = new Set(fetched.map((f) => f.calendarId));
  const all = fetched.flatMap((f) => f.events);
  summary.fetched = all.filter((e) => e.status !== "cancelled").length;
  const byKey = new Map([...checked, ...all].map((e) => [eventKey(e), e]));

  // 1) 控え（キャッシュ）を更新：読み込んだカレンダーの、その期間の予定を入れ替える
  const inRange = (e: GCalEvent) => (e.allDay ? (e.endDate ?? "") > range.from && (e.startDate ?? "") < range.to : e.start.slice(0, 10) < range.to && e.end.slice(0, 10) >= range.from);
  const kept = data.google.events.filter((e) => !fetchedCals.has(e.calendarId) || !inRange(e));
  const cache = [...kept, ...all.filter((e) => e.status !== "cancelled")];
  let next: AppData = { ...data, google: { ...data.google, events: cache, range } };

  // 2) 紐づけ済みの予約を、カレンダーの変更に合わせる
  for (const b of data.bookings) {
    if (b.source !== "google" || !b.calendarId || !b.calendarEventId || !fetchedCals.has(b.calendarId)) continue;
    const day = b.start.slice(0, 10);
    const ev = byKey.get(`${b.calendarId}|${b.calendarEventId}`);
    const within = day >= range.from && day < range.to;
    const label = `${targetName(data, b.target)}（${formatRange(b.start, b.end)}）`;
    if (!ev || ev.status === "cancelled") {
      if (!ev && !within) continue; // 読み込んだ期間の外なので判断しない
      if (b.status === "scheduled") {
        const why = ev ? "Googleカレンダーで予定が削除（キャンセル）されました" : "Googleカレンダーで予定が見つかりません（削除された可能性があります）";
        next = deleteBooking(next, b.id, now);
        next = patchBooking(next, b.id, (x) => ({ ...x, changeNotice: why, history: x.history.map((h, i) => (i === x.history.length - 1 ? { ...h, detail: why } : h)) }));
        summary.removed.push(label);
      }
      continue;
    }
    if (ev.allDay) continue; // 紐づけは時刻のある予定のみ
    if (b.status === "deleted" && !b.history.some((h) => h.detail === "紐づけを解除")) {
      // 一度消えた予定が戻ってきた
      next = restoreBooking(next, b.id, now);
      next = patchBooking(next, b.id, (x) => ({ ...x, changeNotice: "Googleカレンダーに予定が戻りました。内容を確認してください" }));
      summary.restored.push(label);
    }
    if (ev.start !== b.start || ev.end !== b.end) {
      const before = formatRange(b.start, b.end);
      next = rescheduleBooking(next, b.id, ev.start, ev.end, now);
      next = patchBooking(next, b.id, (x) => ({ ...x, changeNotice: `Googleカレンダーで日時が変更されました：${before} → ${formatRange(ev.start, ev.end)}` }));
      summary.rescheduled.push(`${targetName(data, b.target)}：${before} → ${formatRange(ev.start, ev.end)}`);
    }
    if (ev.title !== b.title) next = patchBooking(next, b.id, (x) => ({ ...x, title: ev.title }));
  }

  // 3) 本人が「ほかの回も同じ対象者」にした繰り返し予定は、新しい回も紐づける
  for (const ev of all) {
    if (ev.status === "cancelled" || ev.allDay || !ev.recurringEventId || ev.appTodoId) continue;
    const rule = next.google.seriesLinks.find((s) => s.calendarId === ev.calendarId && s.recurringEventId === ev.recurringEventId);
    if (!rule || linkedBooking(next, ev) || next.google.ignored.includes(eventKey(ev))) continue;
    next = createLinkedBooking(next, ev, rule.target, rule.kind, now, "繰り返し予定の設定により自動で紐づけ");
    summary.autoLinked++;
  }

  return { data: ensureTodos(next, now), summary };
}

/**
 * 読み込み期間内にあるはずなのに一覧に出てこなかった、紐づけ済みの予定（個別に確認が必要なもの）。
 * 期間の外へ日時を移動された予定を「削除」と誤判定しないために使う。
 */
export function missingLinkedEvents(data: AppData, fetched: { calendarId: string; events: GCalEvent[] }[], range: { from: DateKey; to: DateKey }): { calendarId: string; eventId: string }[] {
  const cals = new Set(fetched.map((f) => f.calendarId));
  const seen = new Set(fetched.flatMap((f) => f.events).map(eventKey));
  return data.bookings
    .filter((b) => b.source === "google" && b.status === "scheduled" && b.calendarId && b.calendarEventId && cals.has(b.calendarId))
    .filter((b) => {
      const day = b.start.slice(0, 10);
      return day >= range.from && day < range.to && !seen.has(`${b.calendarId}|${b.calendarEventId}`);
    })
    .map((b) => ({ calendarId: b.calendarId!, eventId: b.calendarEventId! }));
}

function patchBooking(data: AppData, id: string, fn: (b: Booking) => Booking): AppData {
  return { ...data, bookings: data.bookings.map((b) => (b.id === id ? fn(b) : b)) };
}

function createLinkedBooking(data: AppData, ev: GCalEvent, target: TargetRef, kind: BookingKind, now: Date, detail: string): AppData {
  const id = bookingIdForEvent(ev.calendarId, ev.eventId);
  const existing = data.bookings.find((b) => b.id === id);
  if (existing) {
    // 以前の紐づけ（解除済みなど）があれば、同じ予約を使い直す（ToDoが重複しない）
    return patchBooking(data, id, (b) => ({
      ...b,
      target,
      kind,
      start: ev.start,
      end: ev.end,
      title: ev.title,
      status: "scheduled",
      changeNotice: undefined,
      history: [...b.history, { at: toISO(now), type: "target-set", detail: `${detail}：${targetName(data, target)}` }],
    }));
  }
  const b: Booking = {
    id,
    source: "google",
    calendarId: ev.calendarId,
    calendarEventId: ev.eventId,
    calendarRecurringId: ev.recurringEventId,
    title: ev.title,
    kind,
    target,
    start: ev.start,
    end: ev.end,
    location: ev.location ?? "",
    status: "scheduled",
    history: [{ at: toISO(now), type: "created", detail: `${detail}：${targetName(data, target)}` }],
  };
  return { ...data, bookings: [...data.bookings, b] };
}

/** 本人の操作で、Googleの予定を選手・チームの予約に紐づける */
export function linkEvent(data: AppData, ev: GCalEvent, target: TargetRef, kind: BookingKind, includeSeries: boolean, now: Date): AppData {
  let next = createLinkedBooking(data, ev, target, kind, now, "Googleカレンダーの予定を紐づけ");
  if (includeSeries && ev.recurringEventId) {
    const links = next.google.seriesLinks.filter((s) => !(s.calendarId === ev.calendarId && s.recurringEventId === ev.recurringEventId));
    next = { ...next, google: { ...next.google, seriesLinks: [...links, { calendarId: ev.calendarId, recurringEventId: ev.recurringEventId, target, kind }] } };
    // 読み込み済みのほかの回も紐づける
    for (const other of next.google.events) {
      if (other.recurringEventId !== ev.recurringEventId || other.calendarId !== ev.calendarId || other.allDay || linkedBooking(next, other)) continue;
      next = createLinkedBooking(next, other, target, kind, now, "繰り返し予定の設定により自動で紐づけ");
    }
  }
  return ensureTodos(next, now);
}

/** 紐づけを解除（間違えた場合）。予約は「削除」状態として履歴を残し、レポート・完了履歴は消さない */
export function unlinkBooking(data: AppData, bookingId: string, now: Date): AppData {
  const b = data.bookings.find((x) => x.id === bookingId);
  if (!b) return data;
  let next = deleteBooking(data, bookingId, now);
  next = patchBooking(next, bookingId, (x) => ({ ...x, changeNotice: undefined, history: x.history.map((h, i) => (i === x.history.length - 1 ? { ...h, detail: "紐づけを解除" } : h)) }));
  // 繰り返しの自動紐づけも止める
  if (b.calendarRecurringId) {
    next = { ...next, google: { ...next.google, seriesLinks: next.google.seriesLinks.filter((s) => !(s.calendarId === b.calendarId && s.recurringEventId === b.calendarRecurringId && sameTarget(s.target, b.target))) } };
  }
  // 解除で「確認が必要」になったToDoは、本人の操作なので対象外にする
  next = {
    ...next,
    todos: next.todos.map((t) => (t.bookingId === bookingId && t.needsReview ? { ...t, needsReview: undefined, status: t.status === "done" ? t.status : "na", statusReason: t.status === "done" ? t.statusReason : "紐づけを解除したため対象外", statusChangedAt: toISO(now) } : t)),
  };
  return next;
}

export function acknowledgeChange(data: AppData, bookingId: string): AppData {
  return patchBooking(data, bookingId, (b) => ({ ...b, changeNotice: undefined }));
}

export function setIgnored(data: AppData, ev: GCalEvent, ignored: boolean): AppData {
  const k = eventKey(ev);
  const list = data.google.ignored.filter((x) => x !== k);
  return { ...data, google: { ...data.google, ignored: ignored ? [...list, k] : list } };
}

/** まだ紐づけていない予定（時刻のある予定・アプリが登録したもの以外） */
export function unlinkedEvents(data: AppData): GCalEvent[] {
  return data.google.events
    .filter((e) => !e.allDay && !e.appTodoId && e.status !== "cancelled")
    .filter((e) => {
      const b = linkedBooking(data, e);
      return !b || (b.status === "deleted" && b.history.some((h) => h.detail === "紐づけを解除"));
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * 予定名から対象者の候補を出す（断定はしない）。
 * フルネーム・チーム名の一致を優先し、名字だけの一致も候補に含める。
 */
export function candidatesFor(data: AppData, title: string): { target: TargetRef; reason: string }[] {
  const norm = (s: string) => s.replace(/[\s　]/g, "").replace(/（架空）/g, "");
  const t = norm(title);
  const out: { target: TargetRef; reason: string; score: number }[] = [];
  for (const p of data.players) {
    if (t.includes(norm(p.name))) out.push({ target: { type: "player", id: p.id }, reason: "名前が一致", score: 2 });
    else {
      const family = p.name.split(/[\s　]/)[0];
      if (family.length >= 2 && t.includes(family)) out.push({ target: { type: "player", id: p.id }, reason: "名字が一致", score: 1 });
    }
  }
  for (const tm of data.teams) {
    if (t.includes(norm(tm.name))) out.push({ target: { type: "team", id: tm.id }, reason: "チーム名が一致", score: 2 });
  }
  return out.sort((a, b) => b.score - a.score).map(({ target, reason }) => ({ target, reason }));
}

export function guessKind(title: string, target: TargetRef): BookingKind {
  if (target.type === "team") return "team";
  if (/オンライン|online|zoom/i.test(title)) return "online";
  if (/体験/.test(title)) return "trial";
  return "personal";
}

export function addLog(g: GoogleState, ok: boolean, message: string, now: Date): GoogleState {
  const log = { at: toISO(now), ok, message };
  return { ...g, lastSync: log, logs: [...g.logs.slice(-19), log] };
}
