// データから画面に必要な情報を取り出すための関数群。

import type { AppData, Booking, BookingKind, LessonPlan, Report, TargetRef, Todo } from "./types";
import { TODO_LABEL } from "./todoEngine";
import { seminarRuleTask, snsTaskLabel } from "./workTasks";
import { formatTime } from "./time";

export const BOOKING_KIND_LABEL: Record<BookingKind, string> = {
  personal: "対面パーソナル",
  online: "オンライン",
  team: "チームサポート",
  trial: "体験・新規",
};

export const BOOKING_KIND_ICON: Record<BookingKind, string> = {
  personal: "●",
  online: "◆",
  team: "■",
  trial: "▲",
};

export function targetName(data: AppData, target: TargetRef | null | undefined): string {
  if (!target) return "対象者未確定";
  if (target.type === "player") return data.players.find((p) => p.id === target.id)?.name ?? "（不明な選手）";
  return data.teams.find((t) => t.id === target.id)?.name ?? "（不明なチーム）";
}

export function targetHref(target: TargetRef): string {
  return target.type === "player" ? `/players/${target.id}` : `/teams/${target.id}`;
}

export function sameTarget(a: TargetRef | null | undefined, b: TargetRef | null | undefined): boolean {
  return !!a && !!b && a.type === b.type && a.id === b.id;
}

export function bookingOf(data: AppData, todo: Todo): Booking | undefined {
  return todo.bookingId ? data.bookings.find((b) => b.id === todo.bookingId) : undefined;
}

const SEMINAR_TASK_FALLBACK: Record<string, string> = {
  theme: "セミナーのテーマを決める",
  shoot: "解説動画を撮影する",
  thumbnail: "サムネイルを確認する",
  text: "配信文を確認する",
  line: "公式LINEの配信予約を設定する",
};

export function todoTitle(data: AppData, todo: Todo): string {
  if (todo.kind === "manual") return todo.title ?? data.tasks?.find((t) => t.id === todo.taskId)?.title ?? "ToDo";
  if (todo.kind === "sns_task") {
    const r = data.reels.find((x) => x.id === todo.reelId);
    return `${snsTaskLabel(todo.snsKey)}${r ? `（${r.title}）` : ""}`;
  }
  if (todo.kind === "seminar_task") {
    const ep = data.seminars.find((s) => s.id === todo.seminarId);
    const rt = ep ? seminarRuleTask(data.seminarRules ?? [], ep, todo.seminarTaskKey) : undefined;
    const label = rt?.label ?? SEMINAR_TASK_FALLBACK[todo.seminarTaskKey ?? ""] ?? "プチセミナーの作業";
    return `${label}${ep ? `（${Number(ep.deliveryDate.slice(5, 7))}/${Number(ep.deliveryDate.slice(8))}配信）` : ""}`;
  }
  if (todo.seminarId) {
    const ep = data.seminars.find((s) => s.id === todo.seminarId);
    return `${TODO_LABEL[todo.kind]}${ep ? `（${ep.deliveryDate.slice(5).replace("-", "/")}配信）` : ""}`;
  }
  return TODO_LABEL[todo.kind];
}

/** 指導記録（レポート）を日付の新しい順で */
export function reportsOf(data: AppData, target: TargetRef): Report[] {
  return data.reports
    .filter((r) => sameTarget(r.target, target))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

/** 指定した予約より前の、直近のレポート（＝前回記録） */
export function previousReport(data: AppData, target: TargetRef, beforeISO?: string): Report | undefined {
  const list = reportsOf(data, target);
  if (!beforeISO) return list[0];
  const beforeKey = beforeISO.slice(0, 10);
  return list.find((r) => r.date < beforeKey) ?? undefined;
}

export function reportOfBooking(data: AppData, bookingId: string): Report | undefined {
  return data.reports.find((r) => r.bookingId === bookingId);
}

export function bookingsOf(data: AppData, target: TargetRef, includeInactive = false): Booking[] {
  return data.bookings
    .filter((b) => sameTarget(b.target, target) && (includeInactive || b.status === "scheduled"))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function lastBooking(data: AppData, target: TargetRef, now: Date): Booking | undefined {
  const past = bookingsOf(data, target).filter((b) => new Date(b.end) <= now);
  return past[past.length - 1];
}

export function nextBooking(data: AppData, target: TargetRef, now: Date): Booking | undefined {
  return bookingsOf(data, target).find((b) => new Date(b.end) > now);
}

export function bookingShortLabel(data: AppData, b: Booking): string {
  return `${formatTime(b.start)} ${targetName(data, b.target)}（${BOOKING_KIND_LABEL[b.kind]}）`;
}

let counter = 0;
/** 簡易ID生成 */
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function planOfBooking(data: AppData, bookingId: string): LessonPlan | undefined {
  return data.lessonPlans.find((p) => p.bookingId === bookingId);
}
