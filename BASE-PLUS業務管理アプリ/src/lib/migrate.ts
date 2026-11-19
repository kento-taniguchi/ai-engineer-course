// 保存データの移行（古い形 → 新しい形）。
// データの形を変えるときは DATA_VERSION を上げ、ここに移行処理を追加します。
// 既存データを消さずに、足りない項目だけを補います。

import type { AppData, GoogleState, ReelProject, SeminarRule, StandardSlot } from "./types";

export const DATA_VERSION = 5;

export function emptyGoogleState(): GoogleState {
  return { calendars: [], readCalendarIds: [], events: [], logs: [], seriesLinks: [], ignored: [] };
}

/** 通常の予約枠（第3版で変更）: 各60分、次の枠まで10分 */
export const DEFAULT_STANDARD_SLOTS: StandardSlot[] = [
  { id: "std1", start: "16:10", end: "17:10" },
  { id: "std2", start: "17:20", end: "18:20" },
  { id: "std3", start: "18:30", end: "19:30" },
  { id: "std4", start: "19:40", end: "20:40" },
  { id: "std5", start: "20:50", end: "21:50" },
];

/** プチセミナー準備作業の初期ルール（候補。画面で変更できる） */
export const DEFAULT_SEMINAR_RULES: SeminarRule[] = [
  {
    id: "rule-mon",
    deliveryWeekday: 1,
    tasks: [
      { key: "theme", label: "セミナーのテーマを決める", daysBefore: 2 },
      { key: "shoot", label: "解説動画を撮影する", daysBefore: 2 },
      { key: "thumbnail", label: "サムネイルを確認する", daysBefore: 2 },
    ],
  },
  {
    id: "rule-fri",
    deliveryWeekday: 5,
    tasks: [
      { key: "theme", label: "セミナーのテーマを決める", daysBefore: 1 },
      { key: "shoot", label: "解説動画を撮影する", daysBefore: 1 },
      { key: "thumbnail", label: "サムネイルを確認する", daysBefore: 1 },
      { key: "text", label: "配信文を確認する", daysBefore: 1 },
      { key: "line", label: "公式LINEの配信予約を設定する", daysBefore: 1 },
    ],
  },
];

/** SNSリール準備の段階（v2 で「撮影カット」を追加して8段階） */
export const SNS_STEPS = ["テーマを決める", "伝えたいことを整理する", "台本を作る", "撮影カットを考える", "撮影する", "編集する", "投稿文を準備する", "投稿する"];

function migrateReelV1(r: ReelProject): ReelProject {
  // v1 は7段階（テーマ/伝えたいこと/台本/撮影/編集/投稿文/投稿）。
  // 3番目（台本）の後ろに「撮影カット」を空で挿入し、既存のメモ・完了状態の位置を保つ。
  const steps = [...r.steps];
  if (steps.length === 7) steps.splice(3, 0, { done: false, memo: "" });
  while (steps.length < SNS_STEPS.length) steps.push({ done: false, memo: "" });
  // v1 で「テーマを決める」のメモにテーマを書いていた場合は、テーマ欄の初期値にする
  return { ...r, steps, theme: r.theme ?? (steps[0]?.memo || undefined) };
}

export function migrate(raw: AppData): { data: AppData; migratedFrom: number | null } {
  const from = typeof raw.version === "number" ? raw.version : 1;
  if (from >= DATA_VERSION) return { data: raw, migratedFrom: null };
  let d: AppData = { ...raw };
  if (from < 2) {
    d = {
      ...d,
      reels: (d.reels ?? []).map(migrateReelV1),
      snsThemes: d.snsThemes ?? [],
      seminars: d.seminars ?? [],
    };
  }
  if (from < 3) {
    // 予約・利用者データ・旧来の曜日別の枠（weeklySlots）は変更・削除しない。
    // 新しい「通常枠」を追加し、曜日ごとの営業有無は未設定（null）にする。
    d = {
      ...d,
      lessonPlans: d.lessonPlans ?? [],
      standardSlots: d.standardSlots ?? DEFAULT_STANDARD_SLOTS.map((x) => ({ ...x })),
      weekdayOpen: d.weekdayOpen ?? [null, null, null, null, null, null, null],
    };
  }
  if (from < 4) {
    // 通常枠に 20:50〜21:50 を追加（既存の枠・曜日・例外・予約は変更しない）
    const slots = d.standardSlots ?? [];
    const has2050 = slots.some((s) => s.start === "20:50");
    // 旧プチセミナーToDo（seminar_make / seminar_reserve）は、IDを新しい作業に付け替えて履歴を引き継ぐ
    const renamed = (d.todos ?? []).map((t) => {
      if (t.kind !== "seminar_make" && t.kind !== "seminar_reserve") return t;
      const key = t.kind === "seminar_make" ? "shoot" : "line";
      return { ...t, id: `seminar:${t.seminarId}:task:${key}`, kind: "seminar_task" as const, seminarTaskKey: key };
    });
    const seen = new Set<string>();
    const todos = renamed.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
    d = {
      ...d,
      todos,
      standardSlots: has2050 ? slots : [...slots, { id: "std5", start: "20:50", end: "21:50" }],
      tasks: d.tasks ?? [],
      seminarRules: d.seminarRules ?? DEFAULT_SEMINAR_RULES.map((r) => ({ ...r, tasks: r.tasks.map((x) => ({ ...x })) })),
    };
  }
  if (from < 5) {
    // Googleカレンダー連携の設定（未連携の状態）を追加。既存の予約・ToDoは変更しない
    d = { ...d, google: d.google ?? emptyGoogleState() };
  }
  return { data: { ...d, version: DATA_VERSION }, migratedFrom: from };
}
