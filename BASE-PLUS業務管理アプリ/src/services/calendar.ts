// Googleカレンダー連携の窓口（試作版はデモ実装のみ・実際には接続しません）。
//
// 将来の実装方針:
//  1. fetchEvents で指定期間の予定を取得（繰り返し予定は singleEvents=true で各回に展開し、instance ID で区別）
//  2. isBasePlusEvent で BASE-PLUS の予定かを判別
//  3. matchTarget で選手・チームに紐づけ。特定できない場合は null（＝「確認が必要」）
//  4. mergeEvents で既存の予約と calendarEventId をキーに統合 → 重複を防止
//     ・カレンダー側で時間変更 → rescheduled、削除 → deleted として applyBookingEvent に渡す
//  5. ensureTodos で ToDo を補充（IDが固定なので再同期しても重複しない）
//  6. createWorkBlock でアプリ上の作業時間をカレンダーへ登録（登録済みIDを保存し二重登録を防ぐ）

import type { AppData, Booking, Player, TargetRef, Team, TimeBlock } from "@/lib/types";

export interface CalendarEvent {
  id: string;
  recurringEventId?: string;
  title: string;
  start: string;
  end: string;
  location?: string;
}

export interface CalendarProvider {
  readonly connected: boolean;
  readonly label: string;
  fetchEvents(rangeStart: string, rangeEnd: string): Promise<CalendarEvent[]>;
  createWorkBlock(title: string, block: TimeBlock): Promise<{ eventId: string }>;
}

export class CalendarSyncError extends Error {}

/** デモ用: 実際には何も取得・登録しない */
export function createDemoCalendarProvider(opts: { simulateFailure: boolean; current: () => Booking[] }): CalendarProvider {
  return {
    connected: false,
    label: "デモ（Googleカレンダー未連携）",
    async fetchEvents() {
      await new Promise((r) => setTimeout(r, 600));
      if (opts.simulateFailure) throw new CalendarSyncError("デモ: 通信エラーを想定した失敗です（設定で切り替え可）");
      // アプリ内の予約をそのまま返す（＝変化なし）
      return opts.current().map((b) => ({ id: b.calendarEventId ?? b.id, title: b.title, start: b.start, end: b.end, location: b.location }));
    },
    async createWorkBlock() {
      throw new CalendarSyncError("Googleカレンダーには未連携のため登録できません");
    },
  };
}

/** BASE-PLUSの予定か判別（仮の仕様: 予定名に「BASE-PLUS」「指導」「レッスン」を含む） */
export function isBasePlusEvent(ev: CalendarEvent): boolean {
  return /BASE-PLUS|指導|レッスン|チームサポート/i.test(ev.title);
}

/**
 * 予定名から対象者を推定する。
 * 候補が1件に絞れた場合のみ紐づけ、0件または複数件なら null（自動で断定しない）。
 */
export function matchTarget(title: string, players: Player[], teams: Team[]): TargetRef | null {
  const normalize = (s: string) => s.replace(/[\s　]/g, "").replace(/（架空）/g, "");
  const t = normalize(title);
  const hits: TargetRef[] = [];
  for (const p of players) if (t.includes(normalize(p.name))) hits.push({ type: "player", id: p.id });
  for (const tm of teams) if (t.includes(normalize(tm.name))) hits.push({ type: "team", id: tm.id });
  return hits.length === 1 ? hits[0] : null;
}

/** 同期結果の要約（デモでは表示のみ） */
export function summarizeSync(data: AppData, events: CalendarEvent[]): string {
  const known = new Set(data.bookings.map((b) => b.calendarEventId));
  const added = events.filter((e) => !known.has(e.id)).length;
  return `デモ同期: ${events.length}件を確認（新規 ${added}件・重複作成なし）`;
}
