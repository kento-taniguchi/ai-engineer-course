// 架空のデモデータ。実在の選手・チーム・個人情報は含みません。
// 日付は「初回起動日（または設定画面でリセットした日）」を基準に自動で作られます。

import type {
  AppData,
  Attachment,
  Booking,
  BookingKind,
  Measurement,
  Player,
  ReelProject,
  Report,
  SalesItem,
  SeminarEpisode,
  TargetRef,
  Team,
  TodoKind,
} from "./types";
import { addDaysKey, addMonthsKey, combine, dateKey, monthKey, toISO, weekdayOf } from "./time";
import { BOOKING_TODO_KINDS, bookingTodoId, changeTodoStatus, ensureTodos } from "./todoEngine";

export { DATA_VERSION } from "./migrate";
import { DATA_VERSION, DEFAULT_SEMINAR_RULES, DEFAULT_STANDARD_SLOTS, emptyGoogleState } from "./migrate";

export const UNIT_PRICE: Record<BookingKind, number> = {
  personal: 6000,
  online: 4000,
  team: 0, // チームは月額契約で計上（訪問ごとには計上しない）
  trial: 3000,
};

const players: Player[] = [
  { id: "p1", name: "山田 太郎", kana: "やまだ たろう", grade: "中学2年", position: "投手", affiliation: "西町中学校 軟式野球部（架空）", contactMemo: "保護者経由でLINE連絡（架空）", notes: "球速アップが目標。" },
  { id: "p2", name: "佐藤 翔", kana: "さとう しょう", grade: "高校1年", position: "内野手", affiliation: "城北高校 硬式野球部（架空）", contactMemo: "本人にLINE（架空）", notes: "送球の安定性を強化中。" },
  { id: "p3", name: "鈴木 大輝", kana: "すずき だいき", grade: "小学6年", position: "外野手", affiliation: "北町ジュニアスターズ（架空）", contactMemo: "保護者にメール（架空）", notes: "打撃フォームの基礎づくり。" },
  { id: "p4", name: "高橋 蓮", kana: "たかはし れん", grade: "中学3年", position: "捕手", affiliation: "南ヶ丘中学校 野球部（架空）", contactMemo: "オンライン中心（架空）", notes: "スローイングの改善。" },
  { id: "p5", name: "伊藤 陽向", kana: "いとう ひなた", grade: "高校2年", position: "投手", affiliation: "東山クラブ（架空）", contactMemo: "本人にLINE（架空）", notes: "新規。初回指導前。" },
];

const teams: Team[] = [
  { id: "t1", name: "北町ジュニアスターズ（架空）", category: "少年野球", contactPerson: "監督（架空）", contract: { visitsPerMonth: 2, monthlyFee: 30000, startDate: "2026-04-01", notes: "土曜午前に訪問" }, notes: "小学生 約20名" },
  { id: "t2", name: "南ヶ丘中学校 野球部（架空）", category: "中学軟式", contactPerson: "顧問（架空）", contract: { visitsPerMonth: 1, monthlyFee: 18000, startDate: "2026-06-01", notes: "投手陣中心" }, notes: "部員 約25名" },
  { id: "t3", name: "東山クラブ（架空）", category: "高校硬式クラブ", contactPerson: "代表（架空）", contract: { visitsPerMonth: 4, monthlyFee: 50000, startDate: "2026-09-01", notes: "毎週水曜夜" }, notes: "選手 約15名" },
];

interface BookingSeed {
  id: string;
  target: TargetRef | null;
  kind: BookingKind;
  day: number; // 基準日からの日数
  start: string;
  end: string;
  title?: string;
  location?: string;
  status?: Booking["status"];
  plan?: string;
}

const P = (id: string): TargetRef => ({ type: "player", id });
const T = (id: string): TargetRef => ({ type: "team", id });

const bookingSeeds: BookingSeed[] = [
  // 山田（過去3回 + 3日前は未作成 + 明日）
  { id: "b01", target: P("p1"), kind: "personal", day: -42, start: "17:00", end: "18:00" },
  { id: "b02", target: P("p1"), kind: "personal", day: -28, start: "17:00", end: "18:00" },
  { id: "b03", target: P("p1"), kind: "personal", day: -14, start: "17:00", end: "18:00" },
  { id: "b04", target: P("p1"), kind: "personal", day: -3, start: "17:00", end: "18:00" },
  { id: "b05", target: P("p1"), kind: "personal", day: 1, start: "17:00", end: "18:00" },
  { id: "b06", target: P("p1"), kind: "personal", day: 8, start: "17:00", end: "18:00" },
  // 佐藤（昨日の指導が未対応）
  { id: "b07", target: P("p2"), kind: "personal", day: -21, start: "18:00", end: "19:00" },
  { id: "b08", target: P("p2"), kind: "personal", day: -1, start: "18:00", end: "19:00" },
  { id: "b09", target: P("p2"), kind: "personal", day: 4, start: "18:00", end: "19:00", status: "cancelled" },
  { id: "b10", target: P("p2"), kind: "personal", day: 6, start: "18:00", end: "19:00" },
  // 鈴木（今日の夕方）
  { id: "b11", target: P("p3"), kind: "personal", day: -30, start: "16:00", end: "17:00" },
  { id: "b12", target: P("p3"), kind: "personal", day: 0, start: "17:00", end: "18:00" },
  { id: "b13", target: P("p3"), kind: "personal", day: 7, start: "16:00", end: "17:00" },
  // 高橋（オンライン・今日の朝）
  { id: "b14", target: P("p4"), kind: "online", day: -10, start: "09:00", end: "10:00", location: "オンライン" },
  { id: "b15", target: P("p4"), kind: "online", day: 0, start: "09:00", end: "10:00", location: "オンライン" },
  { id: "b16", target: P("p4"), kind: "online", day: 11, start: "09:00", end: "10:00", location: "オンライン" },
  // 伊藤（記録なし・明日が初回）
  { id: "b17", target: P("p5"), kind: "personal", day: 1, start: "19:00", end: "20:00" },
  // チーム
  { id: "b18", target: T("t1"), kind: "team", day: -16, start: "09:00", end: "12:00", location: "北町グラウンド（架空）" },
  { id: "b19", target: T("t1"), kind: "team", day: 0, start: "19:00", end: "21:00", location: "北町体育館（架空）", plan: "1. ウォームアップ（15分）\n2. キャッチボールの基本確認\n3. ティー打撃ローテーション\n4. まとめ" },
  { id: "b20", target: T("t1"), kind: "team", day: 12, start: "09:00", end: "12:00", location: "北町グラウンド（架空）" },
  { id: "b21", target: T("t2"), kind: "team", day: -20, start: "15:30", end: "17:30", location: "南ヶ丘中学校（架空）" },
  { id: "b22", target: T("t2"), kind: "team", day: 5, start: "15:30", end: "17:30", location: "南ヶ丘中学校（架空）" },
  { id: "b23", target: T("t3"), kind: "team", day: 2, start: "19:00", end: "21:00", location: "東山グラウンド（架空）" },
  { id: "b24", target: T("t3"), kind: "team", day: 9, start: "19:00", end: "21:00", location: "東山グラウンド（架空）" },
  // 予定名から対象者を特定できない予約（確認が必要）
  { id: "b25", target: null, kind: "trial", day: 1, start: "10:00", end: "11:00", title: "体験レッスン（新規・名前未記入）" },
];

const reportTexts: Record<string, Omit<Report, "id" | "bookingId" | "target" | "date" | "createdAt" | "updatedAt">> = {
  b01: { purpose: "投球フォームの現状把握", content: "動画撮影でフォームを確認。踏み出し足の向きを修正。", measurements: "球速 98km/h", homework: "シャドーピッチング 30回／日", nextPoints: "踏み出し足をまっすぐ出す", notes: "" },
  b02: { purpose: "下半身の使い方", content: "体重移動のドリル。メディシンボール投げ。", measurements: "球速 101km/h", homework: "片足立ちバランス 左右30秒×3", nextPoints: "軸足に体重を乗せる時間を作る", notes: "" },
  b03: { purpose: "リリースの安定", content: "タオルシャドーでリリース位置を確認。キャッチボールで低めの意識づけ。", measurements: "球速 104km/h／握力 33kg", homework: "タオルシャドー 20回×2セット、股関節ストレッチ", nextPoints: "リリースで指先まで力を伝える", notes: "ホワイトボードに体重移動の図を記載" },
  b07: { purpose: "送球の安定", content: "ステップワークの確認。近距離スローで握り替えを反復。", measurements: "", homework: "握り替え 50回／日", nextPoints: "捕ってから投げるまでのリズム", notes: "" },
  b11: { purpose: "打撃フォームの基礎", content: "構えとトップの位置を確認。置きティーで反復。", measurements: "20m走 3.95秒", homework: "素振り 30回（鏡の前で）", nextPoints: "トップで肩に力が入らないように", notes: "" },
  b14: { purpose: "スローイングの改善（オンライン）", content: "動画を見ながらテイクバックを確認。", measurements: "", homework: "壁当て 20球（フォーム意識）", nextPoints: "耳の横から投げる", notes: "" },
  b18: { purpose: "キャッチボールの基本", content: "全体でキャッチボールの基本動作。低学年と高学年に分けてドリル。", measurements: "", homework: "毎日のキャッチボールで胸に投げる意識", nextPoints: "グラブの使い方", notes: "保護者見学あり" },
  b21: { purpose: "投手陣のフォームチェック", content: "投手5名のフォームを撮影し、個別に修正ポイントを伝達。", measurements: "投手平均球速 102km/h", homework: "股関節ストレッチ、シャドー", nextPoints: "下半身主導のフォーム", notes: "" },
};

function measurementSeed(base: string): Measurement[] {
  const m: Measurement[] = [];
  const add = (target: TargetRef, item: string, unit: string, values: [number, number][]) => {
    values.forEach(([days, value], i) =>
      m.push({ id: `m-${target.id}-${item}-${i}`, target, item, unit, value, date: addDaysKey(base, days) }),
    );
  };
  add(P("p1"), "球速", "km/h", [[-150, 95], [-120, 97], [-90, 98], [-42, 98], [-28, 101], [-14, 104]]);
  add(P("p1"), "体重", "kg", [[-150, 48.0], [-90, 49.4], [-42, 50.2], [-14, 51.1]]);
  add(P("p1"), "握力", "kg", [[-150, 29], [-90, 31], [-14, 33]]);
  add(P("p1"), "垂直ジャンプ", "cm", [[-150, 44], [-90, 47], [-14, 49]]);
  add(P("p1"), "20m走", "秒", [[-150, 3.62], [-90, 3.55], [-14, 3.46]]);
  add(P("p2"), "球速", "km/h", [[-60, 118], [-21, 121]]);
  add(P("p2"), "20m走", "秒", [[-60, 3.21], [-21, 3.18]]);
  add(P("p3"), "20m走", "秒", [[-90, 4.08], [-30, 3.95]]);
  add(P("p3"), "握力", "kg", [[-90, 18], [-30, 20]]);
  add(T("t2"), "投手平均球速", "km/h", [[-80, 99], [-20, 102]]);
  return m;
}

function seminarSeed(base: string): SeminarEpisode[] {
  const eps: SeminarEpisode[] = [];
  const pastThemes = ["キャッチボールで意識すること", "冬の自主練メニュー", "雨の日の室内練習"];
  const future: { theme: string; status: SeminarEpisode["status"] }[] = [
    { theme: "股関節のストレッチ", status: "making" },
    { theme: "", status: "no_theme" },
    { theme: "", status: "no_theme" },
    { theme: "", status: "no_theme" },
    { theme: "", status: "no_theme" },
  ];
  // 基準日の1週間前から、月曜・金曜の配信日を6回分
  let d = addDaysKey(base, -7);
  let pastCount = 0;
  let futureCount = 0;
  while (eps.length < 6) {
    const wd = weekdayOf(d);
    if (wd === 1 || wd === 5) {
      const id = `s${eps.length + 1}`;
      if (d < base) {
        eps.push({ id, deliveryDate: d, theme: pastThemes[pastCount++ % pastThemes.length], status: "delivered", memo: "" });
      } else {
        const f = future[futureCount++];
        eps.push({ id, deliveryDate: d, theme: f.theme, status: f.status, memo: "" });
      }
    }
    d = addDaysKey(d, 1);
  }
  return eps;
}

function salesSeed(bookings: Booking[], base: string, now: Date): SalesItem[] {
  const items: SalesItem[] = [];
  const cur = base.slice(0, 7);
  const prev = addMonthsKey(cur, -1);
  // 予約から（チームは除く）
  for (const b of bookings) {
    if (!b.target || b.kind === "team") continue;
    const past = new Date(b.end) <= now;
    const old = new Date(b.end).getTime() < now.getTime() - 7 * 86400000;
    items.push({
      id: `sale-${b.id}`,
      month: b.start.slice(0, 7),
      service: b.kind === "online" ? "online" : b.kind === "trial" ? "other" : "personal",
      description: `${b.kind === "online" ? "オンライン" : "対面パーソナル"} ${b.start.slice(5, 10).replace("-", "/")}`,
      amount: UNIT_PRICE[b.kind],
      status: b.status === "cancelled" ? "cancelled" : old ? "paid" : past ? "done" : "planned",
      source: { type: "booking", bookingId: b.id },
    });
  }
  // チームの月額契約（1か月1件）
  for (const mk of [prev, cur]) {
    for (const t of teams) {
      if (t.contract.startDate.slice(0, 7) > mk) continue;
      items.push({
        id: `sale-${t.id}-${mk}`,
        month: mk,
        service: "team",
        description: `${t.name} 月額（月${t.contract.visitsPerMonth}回）`,
        amount: t.contract.monthlyFee,
        status: mk === prev ? "paid" : "planned",
        source: { type: "contract", teamId: t.id },
      });
    }
  }
  // 先月分の架空の追加売上（比較用）
  for (let i = 0; i < 9; i++) {
    items.push({ id: `sale-prev-p${i}`, month: prev, service: "personal", description: "対面パーソナル（架空）", amount: 6000, status: "paid", source: { type: "manual" } });
  }
  for (let i = 0; i < 3; i++) {
    items.push({ id: `sale-prev-o${i}`, month: prev, service: "online", description: "オンライン（架空）", amount: 4000, status: "paid", source: { type: "manual" } });
  }
  items.push({ id: "sale-prev-moved", month: prev, service: "personal", description: "対面パーソナル（翌月へ振替・架空）", amount: 6000, status: "moved", source: { type: "manual" }, movedTo: cur });
  return items;
}

const reels: ReelProject[] = [
  {
    id: "r1",
    title: "小学生でもできる握力トレーニング",
    audience: "player",
    theme: "小学生でもできる握力トレーニング",
    steps: [
      { done: true, memo: "家でできる握力トレ" },
      { done: true, memo: "道具なしでOK／毎日1分" },
      { done: false, memo: "冒頭3秒でビフォーアフター" },
      { done: false, memo: "" },
      { done: false, memo: "" },
      { done: false, memo: "" },
      { done: false, memo: "" },
      { done: false, memo: "" },
    ],
    createdAt: "2026-11-01T10:00:00+09:00",
  },
];

export function createDemoData(now: Date): AppData {
  const base = dateKey(now);
  const created = toISO(now);

  const bookings: Booking[] = bookingSeeds.map((s) => {
    const day = addDaysKey(base, s.day);
    const kindName = s.kind === "team" ? "チームサポート" : s.kind === "online" ? "オンライン指導" : "パーソナル指導";
    const name = s.target ? (s.target.type === "player" ? players : teams).find((x) => x.id === s.target!.id)!.name : "";
    const history: Booking["history"] = [{ at: created, type: "created", detail: "デモデータとして作成" }];
    if (s.status === "cancelled") history.push({ at: created, type: "cancelled", detail: "デモ: 先方都合でキャンセル" });
    return {
      id: s.id,
      calendarEventId: `demo-event-${s.id}`,
      title: s.title ?? `【BASE-PLUS】${kindName} ${name}`,
      kind: s.kind,
      target: s.target,
      start: combine(day, s.start),
      end: combine(day, s.end),
      location: s.location ?? (s.kind === "team" ? "" : "BASE-PLUS 練習場（架空）"),
      status: s.status ?? "scheduled",
      source: "demo",
      plan: s.plan,
      history,
    };
  });

  const reports: Report[] = Object.entries(reportTexts).map(([bid, r]) => {
    const b = bookings.find((x) => x.id === bid)!;
    return { id: `rep-${bid}`, bookingId: bid, target: b.target!, date: b.start.slice(0, 10), createdAt: b.end, updatedAt: b.end, ...r };
  });

  const attachments: Attachment[] = [
    { id: "a1", target: P("p1"), reportId: "rep-b03", kind: "whiteboard", label: "ホワイトボード（体重移動の図）", dummy: true, createdAt: created },
    { id: "a2", target: P("p1"), reportId: "rep-b03", kind: "video", label: "投球フォーム（正面）", dummy: true, createdAt: created },
    { id: "a3", target: T("t1"), reportId: "rep-b18", kind: "photo", label: "練習風景", dummy: true, createdAt: created },
  ];

  let data: AppData = {
    version: DATA_VERSION,
    seededAt: created,
    players,
    teams,
    bookings,
    todos: [],
    reports,
    measurements: measurementSeed(base),
    attachments,
    sales: salesSeed(bookings, base, now),
    seminars: seminarSeed(base),
    reels,
    snsThemes: [],
    weeklySlots: [
      { id: "w1", weekday: 1, start: "16:00", end: "21:00", label: "パーソナル" },
      { id: "w2", weekday: 2, start: "16:00", end: "21:00", label: "パーソナル" },
      { id: "w3", weekday: 3, start: "16:00", end: "18:30", label: "パーソナル" },
      { id: "w4", weekday: 4, start: "16:00", end: "21:00", label: "パーソナル" },
      { id: "w5", weekday: 5, start: "16:00", end: "21:00", label: "パーソナル" },
      { id: "w6", weekday: 6, start: "13:00", end: "18:00", label: "パーソナル" },
      { id: "w7", weekday: 0, start: "09:00", end: "12:00", label: "オンライン" },
    ],
    slotExceptions: [{ id: "x1", date: addDaysKey(base, 10), type: "closed", memo: "私用のため休み（架空）" }],
    standardSlots: DEFAULT_STANDARD_SLOTS.map((x) => ({ ...x })),
    weekdayOpen: [null, null, null, null, null, null, null],
    lessonPlans: [],
    tasks: [],
    google: emptyGoogleState(),
    seminarRules: DEFAULT_SEMINAR_RULES.map((r) => ({ ...r, tasks: r.tasks.map((x) => ({ ...x })) })),
    settings: {
      clockOffsetMin: 0,
      simulateSyncFailure: false,
      seminarIdea:
        "【自動化の構想】\n1. 動画を所定のフォルダにアップロード\n2. アプリが配信日（月・金）と紐づけて「動画準備完了」にする\n3. 公式LINEの配信予約を自動作成\n4. 配信後に「配信済み」に更新\n\n※公式LINEの予約配信をAPIで行えるか、プラン条件などは今後確認が必要。",
      futureMemo:
        "【今後追加予定】\n・新規顧客向け申込フォームの自動送信\n・事前ヒアリングシートの自動送信\n・予約確定時の自動返信",
    },
    syncLogs: [],
  };

  data = ensureTodos(data, now);

  // 過去の指導のToDoは完了済みにしておく（デモ用）
  const doneIds = new Set<string>();
  for (const b of bookings) {
    if (b.status !== "scheduled" || !b.target) continue;
    const dayDiff = Math.round((new Date(b.start).getTime() - now.getTime()) / 86400000);
    if (reports.some((r) => r.bookingId === b.id)) {
      BOOKING_TODO_KINDS.forEach((k) => doneIds.add(bookingTodoId(b.id, k)));
    } else if (b.id === "b04") {
      (["review_prev", "remind", "thanks"] as TodoKind[]).forEach((k) => doneIds.add(bookingTodoId(b.id, k)));
    } else if (b.id === "b08") {
      (["review_prev", "remind"] as TodoKind[]).forEach((k) => doneIds.add(bookingTodoId(b.id, k)));
    } else if (dayDiff < -3) {
      BOOKING_TODO_KINDS.forEach((k) => doneIds.add(bookingTodoId(b.id, k)));
    } else if (new Date(b.start) <= now) {
      // 今日すでに始まった指導は、事前確認・リマインドを済ませた想定
      (["review_prev", "remind"] as TodoKind[]).forEach((k) => doneIds.add(bookingTodoId(b.id, k)));
    }
  }
  data.todos = data.todos.map((t) => {
    if (doneIds.has(t.id)) {
      const b = bookings.find((x) => x.id === t.bookingId)!;
      return { ...changeTodoStatus(t, "done", "デモ: 過去の記録", new Date(b.end)), statusChangedAt: b.end };
    }
    return t;
  });
  // 過去回のセミナーToDoは完了扱い
  data.todos = data.todos.map((t) => {
    const ep = t.seminarId ? data.seminars.find((s) => s.id === t.seminarId) : undefined;
    if (ep && ep.deliveryDate <= base && ep.status === "delivered") {
      return changeTodoStatus(t, "done", "デモ: 過去の記録", now);
    }
    return t;
  });

  return data;
}

export { monthKey };
