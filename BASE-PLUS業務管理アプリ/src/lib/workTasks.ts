// SNS・プチセミナー・手動の仕事（第4版）に関する計算。画面から分離しています。

import type { DateKey, ManualTask, Repeat, SeminarEpisode, SeminarRule, SeminarRuleTask, SnsTaskKey, TaskCategory, TodayCategory } from "./types";
import { addDaysKey, diffDays, parseDateKey, weekdayLabel, weekdayOf } from "./time";

// ---------- 分類 ----------

export const CATEGORY_LABEL: Record<TodayCategory, string> = {
  people: "選手・チーム",
  sns: "発信・SNS",
  seminar: "プチセミナー",
  other: "その他の業務",
};

export const TASK_CATEGORY_LABEL: Record<TaskCategory, string> = {
  sns: "SNS",
  seminar: "プチセミナー",
  other: "その他",
};

// ---------- SNS ----------

export const SNS_TASKS: { key: SnsTaskKey; label: string }[] = [
  { key: "theme", label: "リール動画のテーマを決める" },
  { key: "reference", label: "参考動画を確認する" },
  { key: "script", label: "台本と撮影カットを確認する" },
  { key: "shoot", label: "動画を撮影する" },
  { key: "edit", label: "動画を編集する" },
  { key: "caption", label: "投稿文を確認する" },
  { key: "post", label: "リール動画を投稿する" },
];

export function snsTaskLabel(key: SnsTaskKey | undefined): string {
  return SNS_TASKS.find((t) => t.key === key)?.label ?? "SNSの作業";
}

// ---------- プチセミナー ----------

export function ruleForEpisode(rules: SeminarRule[], ep: SeminarEpisode): SeminarRule | undefined {
  return rules.find((r) => r.deliveryWeekday === weekdayOf(ep.deliveryDate));
}

export function seminarRuleTask(rules: SeminarRule[], ep: SeminarEpisode, key: string | undefined): SeminarRuleTask | undefined {
  return ruleForEpisode(rules, ep)?.tasks.find((t) => t.key === key);
}

/** 作業日（配信日の◯日前） */
export function seminarTaskDate(ep: SeminarEpisode, task: SeminarRuleTask): DateKey {
  return addDaysKey(ep.deliveryDate, -task.daysBefore);
}

/** 「配信の2日前（土）」のような説明 */
export function daysBeforeLabel(deliveryWeekday: number, daysBefore: number): string {
  const wd = (((deliveryWeekday - daysBefore) % 7) + 7) % 7;
  return daysBefore === 0 ? `配信当日（${weekdayLabel(wd)}）` : `配信の${daysBefore}日前（${weekdayLabel(wd)}）`;
}

// ---------- 手動の仕事（繰り返し） ----------

/** 毎月の指定日。その月にない日（31日など）は月末にする */
function monthlyDate(year: number, month: number, day: number): DateKey {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const d = Math.min(day, last);
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function repeatLabel(r: Repeat): string {
  if (r.type === "weekly") return `毎週 ${[...r.weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(weekdayLabel).join("・")}曜日`;
  if (r.type === "monthly") return `毎月 ${r.day}日${r.day >= 29 ? "（ない月は月末）" : ""}`;
  return "繰り返さない";
}

/** 繰り返しの過去分をさかのぼって作る上限（日） */
export const BACKFILL_DAYS = 35;

/**
 * 指定期間に発生する回（対応日）の一覧。
 * 繰り返さない仕事は、登録した日の1回だけ（未来の日付でもその回を返す）。
 */
export function occurrences(task: ManualTask, from: DateKey, to: DateKey): DateKey[] {
  const skip = new Set(task.skipDates ?? []);
  const ok = (d: DateKey) => d >= task.date && (!task.until || d < task.until) && !skip.has(d);
  if (task.repeat.type === "none") return ok(task.date) ? [task.date] : [];
  const res: DateKey[] = [];
  const start = from > task.date ? from : task.date;
  if (start > to) return res;
  if (task.repeat.type === "weekly") {
    const wds = new Set(task.repeat.weekdays);
    for (let d = start; d <= to; d = addDaysKey(d, 1)) if (wds.has(weekdayOf(d)) && ok(d)) res.push(d);
  } else {
    const { year, month } = parseDateKey(start);
    for (let i = 0; i < 24; i++) {
      const y = year + Math.floor((month - 1 + i) / 12);
      const m = ((month - 1 + i) % 12) + 1;
      const d = monthlyDate(y, m, task.repeat.day);
      if (d > to) break;
      if (d >= start && ok(d)) res.push(d);
    }
  }
  return res;
}

/** 次に予定されている回（today 以降） */
export function nextOccurrence(task: ManualTask, today: DateKey): DateKey | null {
  return occurrences(task, today, addDaysKey(today, 400))[0] ?? null;
}

export function dueForOccurrence(task: ManualTask, occ: DateKey): DateKey | undefined {
  if (task.repeat.type === "none") return task.dueDate;
  return task.dueOffsetDays === undefined ? undefined : addDaysKey(occ, task.dueOffsetDays);
}

export function taskTodoId(taskId: string, occ: DateKey): string {
  return `task:${taskId}:${occ}`;
}

/** 期限の表示文（「今日まで」「期限超過（昨日まで）」など） */
export function dueLabel(due: DateKey, today: DateKey): string {
  const d = diffDays(due, today);
  if (d < -1) return `期限超過（${Number(due.slice(5, 7))}/${Number(due.slice(8))}まで）`;
  if (d === -1) return "期限超過（昨日まで）";
  if (d === 0) return "今日まで";
  if (d === 1) return "明日まで";
  return `${Number(due.slice(5, 7))}/${Number(due.slice(8))}まで`;
}
