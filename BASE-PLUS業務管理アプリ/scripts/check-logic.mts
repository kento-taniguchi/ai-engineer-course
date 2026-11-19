// ロジックの動作確認スクリプト（npm run check で実行）
import { createDemoData } from "../src/lib/demoData";
import { bucketTodos, ensureTodos, urgencyOf } from "../src/lib/todoEngine";
import { cancelBooking, deleteBooking, rescheduleBooking, restoreBooking, setBookingTarget, upsertLessonPlan, upsertReport } from "../src/lib/operations";
import { checkStandardSlots } from "../src/lib/slots";
import { demoReelPlanner, validateInstagramUrl } from "../src/services/contentAssist";
import { fromJst, addMinutes, dateKey, toISO } from "../src/lib/time";
import { todoTitle, targetName, bookingOf } from "../src/lib/selectors";
import { splitIntoFields, SAMPLE_TRANSCRIPT } from "../src/services/feedbackAssist";
import type { AppData } from "../src/lib/types";
import { weekdayOf as weekdayOfKey } from "../src/lib/time";
import { migrate, DATA_VERSION } from "../src/lib/migrate";
import { buildTodayCategories, todoLevel } from "../src/lib/todayGroups";
import { addTask, closeBookingTodos, deleteTask, editTask, openTodosOfBooking, postponeTodo, setReelPosted, setSnsSchedule, setTodoStatus } from "../src/lib/operations";
import { occurrences, taskTodoId } from "../src/lib/workTasks";
import { addDaysKey, combine, formatRange } from "../src/lib/time";
import { applySyncResult, bookingIdForEvent, candidatesFor, linkEvent, missingLinkedEvents, unlinkBooking, unlinkedEvents } from "../src/lib/gcalSync";
import { eventIdForTodo, isValidClientId, normalizeEvent } from "../src/services/googleCalendar";
import type { GCalEvent } from "../src/lib/types";
import { buildTodayGroups } from "../src/lib/todayGroups";
import { parseYouTubeUrl, seminarLineText } from "../src/lib/youtube";
import { createHmac } from "node:crypto";
import { retryKeyFor, verifyLineSignature } from "../src/server/line";
import { chunk, classifyLineText, deliveryText, episodesToDeliver, latestDeliveredEpisode, quotaAllows, subscribeReply } from "../src/lib/lineLogic";
import { checkRevision, dataFingerprint, decideAutoSync, decideInitialSync, isPristineTodo, sameSummary, mediaPath, mergeDeviceSettings, prepareForCloud, realLookingRecords, summarizeData, validateAppDataShape } from "../src/lib/cloudSync";

let failed = 0;
function ok(cond: boolean, msg: string) {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failed++;
}
const now = fromJst(2026, 11, 18, 14, 0);
const t = (d: AppData, id: string) => d.todos.find((x) => x.id === id)!;
const label = (d: AppData, id: string) => {
  const x = t(d, id);
  const b = bookingOf(d, x);
  return `${todoTitle(d, x)} / ${b ? targetName(d, b.target) : ""}`;
};

let d = createDemoData(now);
const bk = bucketTodos(d, now);
console.log("基準日:", dateKey(now), "14:00");
console.log("期限切れ:", bk.overdue.map((x) => label(d, x.id)));
console.log("今日:", bk.today.map((x) => label(d, x.id)));
console.log("このあと:", bk.later.map((x) => label(d, x.todo.id)));

// 重複しない
const n1 = d.todos.length;
d = ensureTodos(ensureTodos(d, now), now);
ok(d.todos.length === n1, `再同期してもToDoが増えない（${n1}件）`);
ok(new Set(d.todos.map((x) => x.id)).size === d.todos.length, "ToDoのIDが重複していない");

// 緊急度
ok(urgencyOf(t(d, "b04:create_feedback"), d, now).level === "danger", `3日前の未作成フィードバックは赤: ${urgencyOf(t(d, "b04:create_feedback"), d, now).label}`);
ok(urgencyOf(t(d, "b08:send_feedback"), d, now).level === "warning", `昨日の未送信フィードバックは黄: ${urgencyOf(t(d, "b08:send_feedback"), d, now).label}`);
ok(bk.today.some((x) => x.id === "b05:review_prev"), "明日の指導の「前回記録を確認」が今日に出る");
ok(bk.today.some((x) => x.id === "b15:create_feedback"), "今朝のオンライン指導のフィードバック作成が出る");
ok(bk.today.some((x) => x.id === "b15:thanks"), "指導終了1時間後のお礼が出る");
ok(bk.today.some((x) => x.id === "b12:remind"), "今日17時の指導のリマインドが出る");
ok(!bk.today.some((x) => x.id === "b12:thanks"), "まだ終わっていない指導のお礼は出ない");
ok(bk.later.some((x) => x.todo.id === "b12:thanks"), "お礼は「このあと」に出る");
ok(!d.todos.some((x) => x.bookingId === "b25"), "対象者未確定の予約からはToDoを作らない");
ok(!d.todos.some((x) => x.bookingId === "b09"), "キャンセル済み予約からはToDoを作らない");

// 日付が変わっても未完了は残る
const tomorrow = new Date(now.getTime() + 86400000);
const bk2 = bucketTodos(d, tomorrow);
ok(bk2.overdue.some((x) => x.id === "b15:create_feedback"), "翌日になると今日のフィードバックは期限切れ側に残る");
ok(urgencyOf(t(d, "b15:create_feedback"), d, tomorrow).label === "翌日・未作成", "翌日は「翌日・未作成」表示");

// キャンセル → 未着手は対象外、復元で戻る
let c = cancelBooking(d, "b12", "雨天", now);
ok(t(c, "b12:remind").status === "na", "キャンセルで未着手ToDoは対象外");
ok(c.reports.length === d.reports.length, "キャンセルしてもレポートは消えない");
c = restoreBooking(c, "b12", now);
ok(t(c, "b12:remind").status === "todo", "予約の復元でToDoが未着手に戻る");

// 延期 → 完了済みリマインドは要確認
let r = { ...d, todos: d.todos.map((x) => (x.id === "b12:remind" ? { ...x, status: "done" as const } : x)) };
r = rescheduleBooking(r, "b12", addMinutes(bookingOf(r, t(r, "b12:remind"))!.start, 1440 * 2), addMinutes(bookingOf(r, t(r, "b12:remind"))!.end, 1440 * 2), now);
ok(!!t(r, "b12:remind").needsReview, "完了後に延期されたリマインドは「確認が必要」");
ok(!bucketTodos(r, now).today.some((x) => x.id === "b12:create_feedback"), "延期後、未完了ToDoは新しい日時に追従（今日から消える）");

// 削除 → 未完了は要確認、完了は残る
const del = deleteBooking(d, "b04", now);
ok(!!t(del, "b04:create_feedback").needsReview, "予定削除で未完了ToDoは「確認が必要」");
ok(t(del, "b04:thanks").status === "done" && !t(del, "b04:thanks").needsReview, "完了済みToDoはそのまま");

// 対象者を設定 → ToDo生成
const set = setBookingTarget(d, "b25", { type: "player", id: "p5" }, now);
ok(set.todos.filter((x) => x.bookingId === "b25").length === 6, "対象者を選ぶとToDoが6件（メモを含む）作られる");

// レポート保存 → 作成ToDo完了
const rep = upsertReport(d, { id: "rx", bookingId: "b04", target: { type: "player", id: "p1" }, date: "2026-11-15", purpose: "x", content: "", measurements: "", homework: "", nextPoints: "", notes: "", createdAt: "", updatedAt: "" }, now);
ok(t(rep, "b04:create_feedback").status === "done", "レポート保存で「フィードバックを作成」が完了");
ok(t(rep, "b04:send_feedback").status === "todo", "送信ToDoは自動で送信済みにならない");

// 音声デモの振り分け
const sp = splitIntoFields(SAMPLE_TRANSCRIPT);
console.log("振り分け:", sp.fields);
ok(!sp.fields.notes, "該当のない項目（備考）は空欄のまま");
ok(!!sp.fields.purpose && !!sp.fields.content && !!sp.fields.measurements && !!sp.fields.homework && !!sp.fields.nextPoints, "5項目に振り分けられる");

// ---------- v1 → v2 のデータ移行 ----------
{
  const base = createDemoData(now);
  const v1 = JSON.parse(JSON.stringify(base)) as AppData;
  v1.version = 1;
  delete (v1 as Partial<AppData>).snsThemes;
  v1.reels = [{ id: "rv1", title: "旧企画", createdAt: "", steps: ["テーマA", "伝えたい", "台本", "撮影", "編集", "投稿文", "投稿"].map((m, i) => ({ done: i < 3, memo: m })) }];
  v1.reports.push({ ...v1.reports[0], id: "rep-user", content: "ユーザーが入力したレポート" });
  const { data: m, migratedFrom } = migrate(v1 as AppData);
  ok(migratedFrom === 1 && m.version === DATA_VERSION, "v1のデータをv2に移行できる");
  ok(m.reports.some((r) => r.content === "ユーザーが入力したレポート") && m.todos.length === base.todos.length, "移行してもレポート・ToDoは失われない");
  const r = m.reels[0];
  ok(r.steps.length === 8 && r.steps[2].memo === "台本" && r.steps[3].memo === "" && r.steps[4].memo === "撮影" && r.steps[7].memo === "投稿", "SNSの段階に「撮影カット」を挿入しても既存メモの位置がずれない");
  ok(r.theme === "テーマA" && Array.isArray(m.snsThemes), "旧テーマメモをテーマ欄に引き継ぐ／新しい項目を補う");
}

// ---------- 今日やること（選手・チーム単位） ----------
{
  const g = buildTodayGroups(d, now);
  const names = g.map((x) => `${x.name}(${x.open.length}/${x.level})`);
  console.log("グループ:", names);
  const keys = g.map((x) => x.key);
  ok(new Set(keys).size === keys.length, "対象者ごとに1行にまとまる");
  const yamada = g.find((x) => x.key === "player:p1")!;
  ok(yamada.level === "danger" && yamada.label === "期限超過", "指導翌日以降の未完了フィードバックがある対象者は赤「期限超過」");
  const sato = g.find((x) => x.key === "player:p2")!;
  ok(sato.level === "danger", "昨日の指導の未完了フィードバックも赤");
  const suzuki = g.find((x) => x.key === "player:p3")!;
  ok(suzuki.level === "warning", `今日中のリマインドがある対象者は黄「${suzuki.label}」`);
  const ito = g.find((x) => x.key === "player:p5")!;
  ok(ito.level === "normal", "明日の指導の事前確認だけなら通常");
  // 赤の原因を完了にすると赤が消える
  let d2 = d;
  for (const t of yamada.open) d2 = { ...d2, todos: d2.todos.map((x) => (x.id === t.id ? { ...x, status: "done" as const, statusChangedAt: now.toISOString() } : x)) };
  const y2 = buildTodayGroups(d2, now).find((x) => x.key === "player:p1")!;
  ok(y2.open.every((t) => !t.id.startsWith("b04")) && y2.level !== "danger", "完了にすると緊急表示が残らない");
  ok(y2.closed.some((t) => t.id === "b04:create_feedback"), "完了した業務も展開時に確認できる");
  // 対象者のない業務はその他
  const sem = { ...d, todos: [...d.todos, { id: "manual-x", kind: "manual" as const, title: "備品の発注", status: "todo" as const, statusReason: "", history: [], createdAt: toISO(now) }] };
  ok(buildTodayCategories(sem, now).find((c) => c.key === "other")!.open.some((t) => t.id === "manual-x"), "対象者のない業務は「その他の業務」");
}

// ---------- 第3版：今回の指導内容のメモ ----------
{
  let x = createDemoData(now);
  ok(x.todos.some((t) => t.id === "b05:lesson_plan"), "明日の予約に「今回の指導内容をメモ」ができる");
  ok(!x.todos.some((t) => t.id === "b04:lesson_plan") && !x.todos.some((t) => t.id === "b15:lesson_plan"), "すでに始まった・過去の予約には作らない");
  const n = x.todos.length;
  x = ensureTodos(ensureTodos(x, now), now);
  ok(x.todos.length === n, "メモのToDoも重複しない");
  ok(bucketTodos(x, now).today.some((t) => t.id === "b05:lesson_plan"), "予約前日の「今日やること」に表示される");
  const plan = { id: "pl1", bookingId: "b05", target: { type: "player" as const, id: "p1" }, purpose: "", content: "", checks: "", tools: "", memo: "短いメモだけ", bookingStartAtSave: "", createdAt: "", updatedAt: "" };
  x = upsertLessonPlan(x, plan, now);
  ok(x.lessonPlans.length === 1 && x.lessonPlans[0].bookingStartAtSave === x.bookings.find((b) => b.id === "b05")!.start, "短い自由メモだけでも保存でき、予約日時と紐づく");
  ok(t(x, "b05:lesson_plan").status === "done", "保存すると「今回の指導内容をメモ」が完了");
  ok(t(x, "b05:review_prev").status !== "done", "前回記録の確認は完了にならない（別の作業）");
  const b5 = x.bookings.find((b) => b.id === "b05")!;
  x = rescheduleBooking(x, "b05", addMinutes(b5.start, 1440), addMinutes(b5.end, 1440), now);
  ok(x.lessonPlans.length === 1 && x.lessonPlans[0].memo === "短いメモだけ", "予約日時を変更してもメモは消えない");
  ok(x.lessonPlans[0].bookingStartAtSave !== x.bookings.find((b) => b.id === "b05")!.start, "変更後は「保存後に日時が変わった」と判定できる");
  x = cancelBooking(x, "b05", "", now);
  ok(x.lessonPlans.length === 1, "キャンセルしてもメモは消えない");
}

// ---------- 第3版：データ移行 v2 → v3 ----------
{
  const base = createDemoData(now);
  const v2 = JSON.parse(JSON.stringify(base)) as AppData;
  v2.version = 2;
  delete (v2 as Partial<AppData>).lessonPlans;
  delete (v2 as Partial<AppData>).standardSlots;
  delete (v2 as Partial<AppData>).weekdayOpen;
  const before = JSON.stringify(v2.bookings);
  const { data: m } = migrate(v2);
  ok(m.version === DATA_VERSION && m.lessonPlans.length === 0, "v2のデータをv3に移行できる");
  ok(JSON.stringify(m.bookings) === before, "移行しても過去の予約時間は変わらない");
  ok(m.weeklySlots.length === v2.weeklySlots.length, "旧来の曜日別の枠は削除しない");
  ok(m.standardSlots.map((s) => `${s.start}-${s.end}`).join(",") === "16:10-17:10,17:20-18:20,18:30-19:30,19:40-20:40,20:50-21:50", "通常枠が指定の5枠になる");
  ok(m.weekdayOpen.every((w) => w === null), "曜日ごとの営業有無は未設定のまま");
  const c = checkStandardSlots(m.standardSlots);
  ok(c.every((x) => x.length === 60) && c.slice(0, 4).every((x) => x.gapToNext === 10), "各枠60分・次の枠まで10分");
}

// ---------- 第3版：参考リール ----------
{
  ok(validateInstagramUrl("https://www.instagram.com/reel/AbC_12-x/").ok, "正しいリールURLを受け付ける");
  ok(!validateInstagramUrl("https://example.com/reel/abc").ok && !validateInstagramUrl("instagram.com/reel/abc").ok && !validateInstagramUrl("https://www.instagram.com/kent.pt_2026/").ok, "不正なURLを見分ける");
  const ref = "参考動画の独特なセリフ：ズバリ結論から言います";
  const dr = await demoReelPlanner.draftReelPlan({ theme: "前腕のケア", audience: "player", message: "投球後は前腕をほぐす。手首を反らして20秒。", lengthSec: 30, extraNotes: "", styleNote: "", referenceNotes: ref });
  ok(!dr.script.includes("ズバリ") && !dr.shots.some((s) => s.words.includes("ズバリ")) && !dr.caption.includes("ズバリ"), "参考動画のメモの文章をそのまま使わない");
  ok(dr.shots.length === 5 && dr.shots.every((s) => s.visual && s.words), "撮影カット案に映すもの・話す内容が入る");
  ok(dr.notices.some((n) => n.includes("分析していません")) && dr.notices.some((n) => n.includes("医学")), "未分析・未確認であることを知らせる");
}

// ---------- 第4版：データ移行 v3 → v4 ----------
{
  const base = createDemoData(now);
  const v3 = JSON.parse(JSON.stringify(base)) as AppData;
  v3.version = 3;
  delete (v3 as Partial<AppData>).tasks;
  delete (v3 as Partial<AppData>).seminarRules;
  v3.standardSlots = v3.standardSlots.filter((x) => x.start !== "20:50");
  v3.weekdayOpen = [null, true, true, false, true, true, null];
  v3.slotExceptions.push({ id: "xx", date: "2026-12-01", type: "slot_closed", slotId: "std2", memo: "テスト" });
  // 旧形式のプチセミナーToDo（完了済み）
  v3.todos = v3.todos.filter((t) => !t.seminarId);
  v3.todos.push({ id: "seminar:s3:seminar_make", kind: "seminar_make", seminarId: "s3", status: "done", statusReason: "旧データ", history: [{ at: "x", from: "todo", to: "done", reason: "旧データ" }], createdAt: "" });
  const bookingsBefore = JSON.stringify(v3.bookings);
  const { data: m } = migrate(v3);
  ok(m.version === DATA_VERSION, "v3のデータをv4に移行できる");
  ok(m.standardSlots.map((x) => x.start).join(",") === "16:10,17:20,18:30,19:40,20:50", "移行で 20:50〜21:50 の枠が追加され5枠になる");
  ok(JSON.stringify(m.weekdayOpen) === JSON.stringify(v3.weekdayOpen) && m.slotExceptions.length === v3.slotExceptions.length, "曜日ごとの営業設定・日ごとの例外は維持される");
  ok(JSON.stringify(m.bookings) === bookingsBefore, "既存の予約時間は変わらない");
  const moved = m.todos.find((t) => t.id === "seminar:s3:task:shoot");
  ok(!!moved && moved.status === "done" && moved.history.length === 1, "旧プチセミナーToDoの完了履歴を新しい作業に引き継ぐ");
  ok(Array.isArray(m.tasks) && m.seminarRules.length === 2, "手動の仕事・セミナーのルールの初期値が入る");
  const e = ensureTodos(m, now);
  ok(e.todos.filter((t) => t.id === "seminar:s3:task:shoot").length === 1, "引き継いだ作業が重複して作られない");
}

// ---------- 第4版：手動の仕事 ----------
{
  const today = dateKey(now);
  let x = createDemoData(now);
  // 名前だけで登録（対応日＝今日、期限なし）
  x = addTask(x, { id: "t1", title: "指導道具を購入", category: "other", date: today, repeat: { type: "none" }, createdAt: "" }, now);
  ok(x.todos.some((t) => t.id === taskTodoId("t1", today)), "名前だけの仕事を今日の分として登録できる");
  const later = new Date(now.getTime() + 3 * 86400000);
  ok(bucketTodos(x, later).today.some((t) => t.id === taskTodoId("t1", today)), "期限なしの仕事は対応日を過ぎても表示され続ける");
  ok(!todoLevel(x.todos.find((t) => t.id === taskTodoId("t1", today))!, x, later).label.startsWith("期限超過"), "期限がなければ対応日を過ぎても「期限超過」にしない");
  // 期限あり
  x = addTask(x, { id: "t2", title: "請求書の内容を確認", category: "other", date: addDaysKey(today, -3), dueDate: addDaysKey(today, -1), repeat: { type: "none" }, createdAt: "" }, now);
  const t2 = x.todos.find((t) => t.id === taskTodoId("t2", addDaysKey(today, -3)))!;
  ok(bucketTodos(x, now).overdue.some((t) => t.id === t2.id) && todoLevel(t2, x, now).label === "期限超過（昨日まで）", "期限を過ぎた仕事は消えずに「期限超過（昨日まで）」");
  x = addTask(x, { id: "t3", title: "資料を準備", category: "seminar", date: addDaysKey(today, -2), dueDate: addDaysKey(today, 3), repeat: { type: "none" }, createdAt: "" }, now);
  ok(todoLevel(x.todos.find((t) => t.taskId === "t3")!, x, now).level === "normal", "対応日を過ぎても期限前なら「期限超過」にしない");
  // 毎週
  const start = addDaysKey(today, -14);
  x = addTask(x, { id: "w1", title: "SNSの数値を確認", category: "sns", date: start, repeat: { type: "weekly", weekdays: [weekdayOfKey(today)] }, createdAt: "" }, now);
  const weekly = x.todos.filter((t) => t.taskId === "w1").map((t) => t.occurrence).sort();
  ok(weekly.join(",") === [addDaysKey(today, -14), addDaysKey(today, -7), today].join(","), `毎週の仕事が該当日に作られる（${weekly.join(",")}）`);
  const n = x.todos.length;
  x = ensureTodos(ensureTodos(x, now), now);
  ok(x.todos.length === n, "繰り返しの仕事が重複して作られない");
  x = setTodoStatus(x, taskTodoId("w1", today), "done", "", now);
  const nextWeek = new Date(now.getTime() + 7 * 86400000);
  x = ensureTodos(x, nextWeek);
  const nw = x.todos.find((t) => t.id === taskTodoId("w1", addDaysKey(today, 7)))!;
  ok(!!nw && nw.status === "todo", "今週を完了しても、翌週の回は未完了で表示される");
  // 毎月（31日 → 月末）
  const occ = occurrences({ id: "m", title: "", category: "other", date: "2026-01-01", repeat: { type: "monthly", day: 31 }, createdAt: "" }, "2026-02-01", "2026-04-30");
  ok(occ.join(",") === "2026-02-28,2026-03-31,2026-04-30", "毎月31日の仕事は、31日がない月は月末になる");
  // 編集：今回のみ
  const edit = { title: "SNSの数値を確認（変更）", category: "sns" as const, workDate: today, repeat: { type: "weekly" as const, weekdays: [weekdayOfKey(today)] } };
  let y = editTask(x, "w1", addDaysKey(today, -7), edit, "this", now);
  ok(y.todos.find((t) => t.id === taskTodoId("w1", addDaysKey(today, -7)))!.title === edit.title && y.tasks.find((t) => t.id === "w1")!.title === "SNSの数値を確認", "「今回のみ」の変更はその回だけ");
  // 編集：今後も含める（完了済みの回は変えない）
  y = editTask(x, "w1", addDaysKey(today, -7), edit, "future", now);
  ok(y.tasks.find((t) => t.id === "w1")!.title === edit.title && y.todos.find((t) => t.id === taskTodoId("w1", today))!.title === "SNSの数値を確認", "「今後も含める」は設定を変え、完了済みの回は変えない");
  // 削除：今回のみ
  let z = deleteTask(x, "w1", addDaysKey(today, -7), "this");
  z = ensureTodos(z, now);
  ok(!z.todos.some((t) => t.id === taskTodoId("w1", addDaysKey(today, -7))) && z.todos.some((t) => t.id === taskTodoId("w1", addDaysKey(today, -14))), "「今回のみ」削除はその回だけ消え、再作成されない");
  // 削除：今後も含める（完了履歴は残す）
  z = deleteTask(x, "w1", addDaysKey(today, -14), "future");
  z = ensureTodos(z, nextWeek);
  ok(z.todos.some((t) => t.id === taskTodoId("w1", today) && t.status === "done") && !z.todos.some((t) => t.id === taskTodoId("w1", addDaysKey(today, 7))), "「今後も含める」削除で以降は作られず、完了した回の履歴は残る");
  // 後日に変更
  const p = postponeTodo(x, taskTodoId("t1", today), addDaysKey(today, 2), now);
  const pt = p.todos.find((t) => t.id === taskTodoId("t1", today))!;
  ok(!bucketTodos(p, now).today.some((t) => t.id === pt.id) && bucketTodos(p, new Date(now.getTime() + 2 * 86400000)).today.some((t) => t.id === pt.id) && pt.history.length > 0, "後日に変更すると、その日から同じToDoとして表示される");
  // 分類
  const cats = buildTodayCategories(x, now);
  ok(cats.map((c) => c.key).join(",") === "people,sns,seminar,other", "今日やることが4つの分類に分かれる");
  ok(cats.find((c) => c.key === "other")!.open.some((t) => t.taskId === "t1") && cats.find((c) => c.key === "seminar")!.open.some((t) => t.taskId === "t3"), "手動の仕事が指定した分類に入る");
  ok(cats.find((c) => c.key === "other")!.level === "warning" && cats.find((c) => c.key === "other")!.label === "期限超過", "分類の見出しに緊急性が出る");
}

// ---------- 第4版：SNS・プチセミナー ----------
{
  const today = dateKey(now);
  let x = createDemoData(now);
  ok(!x.todos.some((t) => t.kind === "sns_task"), "SNSの作業は日付を設定するまでToDoにならない（勝手に日付を決めない）");
  x = setSnsSchedule(x, "r1", "post", { workDate: today }, now);
  const post = x.todos.find((t) => t.id === "reel:r1:post")!;
  ok(!!post && bucketTodos(x, now).today.some((t) => t.id === post.id), "対応日を設定したSNSの作業が今日やることに出る");
  ok(buildTodayCategories(x, now).find((c) => c.key === "sns")!.open.some((t) => t.id === post.id), "「発信・SNS」に分類される");
  x = setTodoStatus(x, post.id, "done", "", now);
  ok(!x.reels.find((r) => r.id === "r1")!.postedAt && !x.reels.find((r) => r.id === "r1")!.steps[7].done, "ToDoを完了しても投稿済みにはならない");
  x = setReelPosted(x, "r1", true, now);
  ok(!!x.reels.find((r) => r.id === "r1")!.postedAt, "本人が「投稿済み」にできる");
  const fri = x.seminars.find((s) => weekdayOfKey(s.deliveryDate) === 5 && s.status !== "delivered")!;
  const line = x.todos.find((t) => t.id === `seminar:${fri.id}:task:line`);
  ok(!!line && x.todos.filter((t) => t.seminarId === fri.id).length === 5, "金曜配信分に5つの準備作業が作られる");
  x = setTodoStatus(x, line!.id, "done", "", now);
  ok(!x.seminars.find((s) => s.id === fri.id)!.lineDraft && x.seminars.find((s) => s.id === fri.id)!.status !== "waiting_reserve", "配信予約のToDoを完了してもLINE予約済みにはならない");
  const n = x.todos.length;
  ok(ensureTodos(x, now).todos.length === n, "セミナーの作業も重複しない");
}

// ---------- 第5版：Googleカレンダー連携（架空の予定で確認） ----------
{
  const today = dateKey(now);
  const tomorrow = addDaysKey(today, 1);
  const range = { from: addDaysKey(today, -14), to: addDaysKey(today, 60) };
  const CAL = "demo-cal@example.com";
  const ev = (id: string, title: string, day: string, s1: string, e1: string, extra: Partial<GCalEvent> = {}): GCalEvent => ({ calendarId: CAL, eventId: id, title, start: combine(day, s1), end: combine(day, e1), allDay: false, status: "confirmed", ...extra });

  // 変換：時刻あり・終日・タイムゾーン
  const n1 = normalizeEvent({ id: "a", summary: "X", start: { dateTime: "2026-11-19T08:00:00Z" }, end: { dateTime: "2026-11-19T09:00:00Z" } }, CAL)!;
  ok(n1.start === "2026-11-19T17:00:00+09:00" && !n1.allDay, "Googleの予定時刻を日本時間に変換する（UTC 8:00 → 17:00）");
  const n2 = normalizeEvent({ id: "b", summary: "合宿", start: { date: "2026-11-21" }, end: { date: "2026-11-23" } }, CAL)!;
  ok(n2.allDay && n2.startDate === "2026-11-21" && n2.endDate === "2026-11-23", "終日予定は日付のみで扱う（終了日は含まない）");
  ok(isValidClientId("123456789012-abcdef0123456789.apps.googleusercontent.com") && !isValidClientId("GOCSPX-secret") && !isValidClientId(""), "クライアントIDの形式を確認し、シークレットのような値は受け付けない");
  const eid = eventIdForTodo("task:abc:2026-11-18");
  ok(eid === eventIdForTodo("task:abc:2026-11-18") && /^[0-9a-v]{5,1024}$/.test(eid), "作業予定のIDはToDoごとに常に同じ（再試行で二重登録しない）・Googleで使える文字だけ");

  let x = createDemoData(now);
  const events = [
    ev("ev1", "パーソナル 伊藤陽向", tomorrow, "18:00", "19:00"),
    ev("ev2", "山田 指導", tomorrow, "16:10", "17:10"),
    ev("ev3", "歯医者", today, "12:00", "13:00"),
    ev("rec_1", "【定期】北町ジュニアスターズ（架空）", addDaysKey(today, 3), "09:00", "12:00", { recurringEventId: "rec" }),
    ev("rec_2", "【定期】北町ジュニアスターズ（架空）", addDaysKey(today, 10), "09:00", "12:00", { recurringEventId: "rec" }),
    { calendarId: CAL, eventId: "all1", title: "大会", start: combine(today, "00:00"), end: combine(tomorrow, "00:00"), allDay: true, startDate: today, endDate: tomorrow, status: "confirmed" as const },
  ];
  const before = x.bookings.length;
  x = applySyncResult(x, [{ calendarId: CAL, events }], range, now).data;
  ok(x.bookings.length === before && x.google.events.length === 6, "読み込んだだけでは予約を作らない（自動で断定しない）");
  ok(unlinkedEvents(x).length === 5, "時刻のある予定が「紐づけ待ち」に出る（終日予定は除く）");
  ok(candidatesFor(x, "パーソナル 伊藤陽向")[0]?.target.id === "p5", "予定名から候補（伊藤 陽向）を出す");
  ok(candidatesFor(x, "山田 指導").length === 1 && candidatesFor(x, "山田 指導")[0].reason === "名字が一致", "名字だけの一致は「名字が一致」の候補として示す");
  ok(candidatesFor(x, "歯医者").length === 0, "判断できない予定は候補なし（本人が選ぶ）");

  // 紐づけ → ToDo
  x = linkEvent(x, events[0], { type: "player", id: "p5" }, "personal", false, now);
  const bid = bookingIdForEvent(CAL, "ev1");
  ok(x.bookings.some((b) => b.id === bid && b.source === "google"), "予定を選手の予約に紐づけられる");
  const kinds = x.todos.filter((t) => t.bookingId === bid).map((t) => t.kind).sort().join(",");
  ok(kinds === "create_feedback,lesson_plan,remind,review_prev,send_feedback,thanks", `紐づけた予約から既存ルールのToDoができる（${kinds}）`);
  ok(bucketTodos(x, now).today.some((t) => t.id === `${bid}:review_prev`) && bucketTodos(x, now).today.some((t) => t.id === `${bid}:lesson_plan`), "指導前日に前回記録の確認・指導メモが出る");
  const nTodos = x.todos.length;
  x = applySyncResult(x, [{ calendarId: CAL, events }], range, now).data;
  x = applySyncResult(x, [{ calendarId: CAL, events }], range, now).data;
  ok(x.todos.length === nTodos && x.bookings.filter((b) => b.id === bid).length === 1, "同じ予定を何度読み込んでも予約・ToDoが重複しない");
  x = linkEvent(x, events[0], { type: "player", id: "p5" }, "personal", false, now);
  ok(x.todos.length === nTodos, "同じ予定をもう一度紐づけても重複しない");

  // 繰り返し：ほかの回も
  x = linkEvent(x, events[3], { type: "team", id: "t1" }, "team", true, now);
  ok(x.bookings.some((b) => b.id === bookingIdForEvent(CAL, "rec_2")), "繰り返し予定の「ほかの回も」で、読み込み済みの回も紐づく");
  const rec3 = ev("rec_3", "【定期】北町ジュニアスターズ（架空）", addDaysKey(today, 17), "09:00", "12:00", { recurringEventId: "rec" });
  x = applySyncResult(x, [{ calendarId: CAL, events: [...events, rec3] }], range, now).data;
  ok(x.bookings.some((b) => b.id === bookingIdForEvent(CAL, "rec_3")), "繰り返しの新しい回も、本人の設定に従って紐づく");

  // レポートと完了履歴を作っておく
  x = setTodoStatus(x, `${bid}:review_prev`, "done", "確認した", now);
  x = upsertReport(x, { id: "rep-g", bookingId: bid, target: { type: "player", id: "p5" }, date: tomorrow, purpose: "テスト", content: "", measurements: "", homework: "", nextPoints: "", notes: "", createdAt: "", updatedAt: "" }, now);

  // 日時変更
  const moved = events.map((e) => (e.eventId === "ev1" ? { ...e, start: combine(tomorrow, "19:00"), end: combine(tomorrow, "20:00") } : e));
  const r1 = applySyncResult(x, [{ calendarId: CAL, events: [...moved, rec3] }], range, now);
  x = r1.data;
  const b1 = x.bookings.find((b) => b.id === bid)!;
  ok(b1.start === combine(tomorrow, "19:00") && !!b1.changeNotice && b1.changeNotice.includes("→"), "Google側の日時変更を反映し、変更内容（旧→新）を表示する");
  ok(x.reports.some((r) => r.id === "rep-g") && x.todos.find((t) => t.id === `${bid}:review_prev`)!.status === "done", "日時変更でレポート・完了履歴は消えない");
  ok(!!x.todos.find((t) => t.id === `${bid}:review_prev`)!.needsReview, "完了済みの事前確認は「やり直しが必要か確認」に出る");

  // キャンセル（削除）
  const cancelled = moved.map((e) => (e.eventId === "ev1" ? { ...e, status: "cancelled" as const } : e));
  x = applySyncResult(x, [{ calendarId: CAL, events: [...cancelled, rec3] }], range, now).data;
  const b2 = x.bookings.find((b) => b.id === bid)!;
  ok(b2.status === "deleted" && !!b2.changeNotice, "Google側で削除された予定は予約を「削除扱い」にし、お知らせを出す");
  ok(x.reports.some((r) => r.id === "rep-g") && x.todos.filter((t) => t.bookingId === bid && t.status !== "done").every((t) => !!t.needsReview), "削除でもレポートは残り、未完了ToDoは自動で対象外にせず「確認が必要」");
  // 予定が見つからない（読み込み期間内）
  const r2 = applySyncResult(x, [{ calendarId: CAL, events: events.filter((e) => !e.recurringEventId).filter((e) => e.eventId !== "ev1") }], range, now);
  ok(r2.summary.removed.some((s) => s.includes("北町")), "読み込み期間内で見つからなくなった予定も「削除の可能性」として知らせる");
  // 読み込み期間の外へ移動された予定（個別に確認して見つかった）は削除扱いにしない
  const fetchedNoRec = [{ calendarId: CAL, events: events.filter((e) => !e.recurringEventId) }];
  const missing = missingLinkedEvents(x, fetchedNoRec, range);
  ok(missing.some((m) => m.eventId === "rec_1") && !missing.some((m) => m.eventId === "ev2"), "期間内に見つからない紐づけ済みの予定だけを個別確認の対象にする");
  const far = addDaysKey(today, 90);
  const movedFar = ev("rec_1", "【定期】北町ジュニアスターズ（架空）", far, "09:00", "12:00", { recurringEventId: "rec" });
  const r2b = applySyncResult(x, fetchedNoRec, range, now, [movedFar]);
  const bFar = r2b.data.bookings.find((b) => b.id === bookingIdForEvent(CAL, "rec_1"))!;
  ok(bFar.status === "scheduled" && bFar.start === combine(far, "09:00") && !!bFar.changeNotice && !r2b.summary.removed.some((s) => s.includes(formatRange(combine(addDaysKey(today, 3), "09:00"), combine(addDaysKey(today, 3), "12:00")))), "期間外へ移動した予定は「削除」ではなく「日時変更」として知らせる");
  ok(!r2b.data.google.events.some((e) => e.eventId === "rec_1" && e.start.startsWith(far)), "個別に確認した予定は控え（表示用）に入れない");
  // 読み込まなかったカレンダーの予約は変更しない
  const r3 = applySyncResult(x, [{ calendarId: "other-cal", events: [] }], range, now);
  ok(r3.data.bookings.find((b) => b.id === bookingIdForEvent(CAL, "rec_1"))!.status === "scheduled", "読み込んでいないカレンダーの予約は変更しない");

  // 紐づけ解除
  let u = unlinkBooking(x, bookingIdForEvent(CAL, "rec_1"), now);
  ok(u.bookings.find((b) => b.id === bookingIdForEvent(CAL, "rec_1"))!.status === "deleted" && unlinkedEvents(u).some((e) => e.eventId === "rec_1"), "紐づけを解除すると、予定は再び「紐づけ待ち」に戻る");
  u = linkEvent(u, events[3], { type: "team", id: "t2" }, "team", false, now);
  ok(u.bookings.filter((b) => b.id === bookingIdForEvent(CAL, "rec_1")).length === 1 && u.bookings.find((b) => b.id === bookingIdForEvent(CAL, "rec_1"))!.target!.id === "t2", "別の対象者に紐づけ直しても予約は重複しない");

  // 削除扱いの予約のToDoをまとめて対象外（本人の操作）
  {
    const openBefore = openTodosOfBooking(x, bid);
    const doneBefore = x.todos.filter((t) => t.bookingId === bid && t.status === "done").map((t) => t.id);
    const y = closeBookingTodos(x, bid, "予定が削除されたため、まとめて対象外", now);
    ok(openBefore.length > 0 && openTodosOfBooking(y, bid).length === 0 && y.todos.filter((t) => t.bookingId === bid && t.status === "na").length >= openBefore.length, "削除扱いの予約の未完了ToDoを、まとめて対象外にできる");
    ok(doneBefore.every((id) => y.todos.find((t) => t.id === id)!.status === "done") && y.reports.some((r) => r.id === "rep-g"), "まとめて対象外にしても、完了済みのToDoとレポートは変わらない");
    ok(y.todos.filter((t) => t.bookingId === bid).every((t) => !t.needsReview || t.status === "done"), "まとめて対象外にすると「確認が必要」から消える");
    const activeId = bookingIdForEvent(CAL, "rec_2");
    ok(closeBookingTodos(x, activeId, "誤操作", now) === x, "有効な予約では、まとめて対象外にしない（誤操作防止）");
  }

  // 既存データの保持（デモ予約）
  ok(x.bookings.filter((b) => b.source === "demo").length === createDemoData(now).bookings.length, "既存の予約（デモ）はGoogleの読み込みで変更されない");
}

// ---------- 第5版：データ移行 v4 → v5 ----------
{
  const base = createDemoData(now);
  const v4 = JSON.parse(JSON.stringify(base)) as AppData;
  v4.version = 4;
  delete (v4 as Partial<AppData>).google;
  const before = JSON.stringify({ b: v4.bookings, t: v4.todos, r: v4.reports });
  const { data: m } = migrate(v4);
  ok(m.version === DATA_VERSION && !!m.google && m.google.events.length === 0, "v4のデータをv5に移行（Google連携は未接続の状態で追加）");
  ok(JSON.stringify({ b: m.bookings, t: m.todos, r: m.reports }) === before, "移行で予約・ToDo・レポートは変わらない");
}

// ---------- 第6版準備：PC・iPhone間の共有（判断のルール。通信はしない） ----------
{
  const base = createDemoData(now);
  ok(realLookingRecords(base).players.length === 0 && realLookingRecords(base).teams.length === 0, "デモデータは「架空」と判定される（実在の情報とみなさない）");
  const withReal = { ...base, players: [...base.players, { id: "px", name: "テスト 選手", kana: "", grade: "", position: "", affiliation: "", contactMemo: "", notes: "" }] };
  ok(realLookingRecords(withReal).players.includes("px"), "「（架空）」の付いていない選手は、実在の可能性があるとして数える");

  const d0 = decideInitialSync(base, null);
  ok(d0.action === "offer-upload" && !d0.needsRealDataConfirm, "クラウドが空なら、自動では送らず「アップロードの確認」を出す");
  const d1 = decideInitialSync(withReal, null);
  ok(d1.action === "offer-upload" && d1.needsRealDataConfirm, "実在の可能性がある情報を含む場合は、本番準備の確認を必須にする");
  ok(decideInitialSync(null, base).action === "use-remote", "この端末が空ならクラウドのデータを使う");
  const shifted = { ...base, settings: { ...base.settings, clockOffsetMin: 180 } };
  ok(decideInitialSync(shifted, base).action === "same", "デモ用の時刻ずらしなど端末ごとの設定の違いは「同じ内容」とみなす");
  const edited = { ...base, reports: [] };
  const d2 = decideInitialSync(edited, base);
  ok(d2.action === "ask", "両方に違うデータがあれば、自動で上書きせず本人に選んでもらう");
  ok(prepareForCloud(shifted).settings.clockOffsetMin === 0 && shifted.settings.clockOffsetMin === 180, "クラウドへは端末ごとの設定を送らない（元のデータは変更しない）");
  ok(mergeDeviceSettings(base, shifted).settings.clockOffsetMin === 180, "クラウドから受け取ったデータに、この端末の設定を戻す");
  ok(checkRevision(3, 3) === "ok" && checkRevision(3, 4) === "conflict" && checkRevision(0, null) === "ok", "版番号が違えば保存しない（他の端末の変更を上書きしない）");
  ok(validateAppDataShape({ foo: 1 }).ok === false && validateAppDataShape({ ...base, version: DATA_VERSION + 1 }).ok === false && validateAppDataShape(base).ok, "読み込むデータの形と版を確認する");
  const uid = "123e4567-e89b-12d3-a456-426614174000";
  ok(mediaPath(uid, "m-1", "video.MOV") === `${uid}/m-1.mov` && mediaPath(uid, "../x", "a.jpg") === `${uid}/x.jpg`, "写真・動画は本人のフォルダの下にだけ保存する（パスの細工を除去）");
  let threw = false;
  try {
    mediaPath("../other", "m", "a.jpg");
  } catch {
    threw = true;
  }
  ok(threw, "ユーザーIDの形式が正しくなければ保存場所を作らない");
  ok(summarizeData(base).players === base.players.length, "移行前に件数を表示できる");
  ok(dataFingerprint(base) === dataFingerprint(JSON.parse(JSON.stringify(base))) && dataFingerprint(base) === dataFingerprint(shifted), "同じ内容なら指紋が同じ（端末ごとの設定の違いは無視）");
  // クラウドのデータベースは項目の順番を並べ替える（jsonb）→ 順番が違っても同じ内容と判定する
  const reorder = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(reorder) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).reverse().map(([k, x]) => [k, reorder(x)])) : v;
  const roundTripped = reorder(JSON.parse(JSON.stringify(base))) as typeof base;
  ok(JSON.stringify(roundTripped) !== JSON.stringify(base) && dataFingerprint(roundTripped) === dataFingerprint(base) && decideInitialSync(base, roundTripped).action === "same", "クラウドで項目の順番が入れ替わっても、同じ内容と判定する（読み戻し確認・同期の判定）");
  // 自動同期：端末ごとに作り直せるもの（Googleの控え・自動で作られた未着手のToDo）は「変更」とみなさない
  {
    const withEvents = { ...base, google: { ...base.google, events: [{ calendarId: "c", eventId: "e", title: "x", start: "", end: "", allDay: false, status: "confirmed" as const }], logs: [{ at: "", ok: true, message: "読み込み" }] } };
    ok(dataFingerprint(withEvents) === dataFingerprint(base), "Googleカレンダーの控え・連携の履歴の違いは「変更」とみなさない（2台で読み込んでも競合しない）");
    const pristine = base.todos.find((t) => isPristineTodo(t))!;
    const fewer = { ...base, todos: base.todos.filter((t) => t.id !== pristine.id) };
    ok(dataFingerprint(fewer) === dataFingerprint(base), "自動で作られ、まだ触っていないToDoの有無は「変更」とみなさない（どの端末でも作り直せる）");
    const touched = { ...base, todos: base.todos.map((t) => (t.id === pristine.id ? { ...t, status: "done" as const, statusReason: "済", history: [{ at: "", from: "todo" as const, to: "done" as const, reason: "済" }] } : t)) };
    ok(dataFingerprint(touched) !== dataFingerprint(base) && !isPristineTodo(touched.todos.find((t) => t.id === pristine.id)!), "ToDoの状態を変えたら「変更」とみなす");
    const fp0 = dataFingerprint(base);
    const fp1 = dataFingerprint(touched);
    const m = { revision: 3, fingerprint: fp0 };
    ok(decideAutoSync(m, fp0, { revision: 3, fingerprint: fp0 }) === "none", "自動同期：変更なし → 何もしない");
    ok(decideAutoSync(m, fp1, { revision: 3, fingerprint: fp0 }) === "push", "自動同期：この端末だけ変更 → 保存する");
    ok(decideAutoSync(m, fp0, { revision: 4, fingerprint: fp1 }) === "pull", "自動同期：他の端末だけ変更 → この端末に読み込む");
    ok(decideAutoSync(m, fp1, { revision: 4, fingerprint: dataFingerprint(edited) }) === "conflict", "自動同期：両方で変更 → 上書きせず本人に選んでもらう");
    ok(decideAutoSync(m, fp1, { revision: 4, fingerprint: fp1 }) === "adopt", "自動同期：両方とも同じ内容になっていれば、記録をそろえるだけ");
    ok(decideAutoSync(null, fp0, { revision: 2, fingerprint: fp1 }) === "setup" && decideAutoSync(null, fp0, { revision: 2, fingerprint: fp0 }) === "adopt", "自動同期：まだつないでいない端末は、内容が違えば最初の選択を求める");
    ok(decideAutoSync(m, fp0, null) === "setup", "自動同期：クラウドが空なら最初の設定に戻る（勝手にアップロードしない）");
  }
  ok(dataFingerprint(base) !== dataFingerprint(edited), "内容が変われば指紋が変わる（未保存の変更を検出できる）");
  ok(sameSummary(summarizeData(base), summarizeData(JSON.parse(JSON.stringify(base)))) && !sameSummary(summarizeData(base), summarizeData(edited)), "読み戻した件数の一致を確認できる");
}

// ---------- プチセミナー：YouTube（限定公開）のURL ----------
{
  const id = "dQw4w9WgXcQ";
  const forms = [`https://youtu.be/${id}?si=abcDEF123`, `https://www.youtube.com/watch?v=${id}&t=10s`, `https://m.youtube.com/watch?v=${id}`, `https://youtube.com/shorts/${id}?feature=share`, `https://www.youtube.com/live/${id}`, `youtu.be/${id}`];
  ok(forms.every((f) => { const p = parseYouTubeUrl(f); return p.ok && p.videoId === id && p.url === `https://youtu.be/${id}`; }), "YouTubeの共有URL・視聴ページ・ショート・ライブのURLを読み取り、追跡情報（si= など）を除いた短いURLにする");
  ok(!parseYouTubeUrl("https://www.youtube.com/@baseplus").ok && !parseYouTubeUrl("https://www.youtube.com/playlist?list=PL123").ok, "チャンネル・再生リストのURLは動画として受け付けない");
  ok(!parseYouTubeUrl("https://example.com/watch?v=dQw4w9WgXcQ").ok && !parseYouTubeUrl("https://evil-youtube.com/watch?v=dQw4w9WgXcQ").ok && !parseYouTubeUrl("").ok, "YouTube以外のサイトや空欄は受け付けない");
  const text = seminarLineText("投球フォームの基本", `https://youtu.be/${id}`);
  ok(text.includes("投球フォームの基本") && text.includes(`https://youtu.be/${id}`), "公式LINEの配信文に、テーマと動画のURLが入る");
}

// ---------- 公式LINE：自動返信・配信日の一斉送信のルール ----------
{
  const u = (id: string) => `https://youtu.be/${id}`;
  const eps = [
    { id: "s1", deliveryDate: "2026-11-16", theme: "テーマA", youtubeUrl: u("AAAAAAAAAAA") },
    { id: "s2", deliveryDate: "2026-11-20", theme: "テーマB", youtubeUrl: u("BBBBBBBBBBB") },
    { id: "s3", deliveryDate: "2026-11-23", theme: "テーマC", youtubeUrl: u("CCCCCCCCCCC") },
    { id: "s4", deliveryDate: "2026-11-27", theme: "テーマD" },
  ];
  ok(classifyLineText("セミナー") === "subscribe" && classifyLineText("プチセミナー見たいです") === "subscribe" && classifyLineText("配信停止") === "stop" && classifyLineText("セミナー 配信停止") === "stop" && classifyLineText("こんにちは") === "other", "「セミナー」は申込、「配信停止」は停止、それ以外は返信しない");
  ok(latestDeliveredEpisode(eps, "2026-11-22")?.id === "s2" && latestDeliveredEpisode(eps, "2026-11-20")?.id === "s2" && latestDeliveredEpisode(eps, "2026-11-15") === null, "返信で案内するのは、配信日を迎えた回のうちURLのある最新の回（配信前の回のURLは渡さない）");
  ok(episodesToDeliver(eps, "2026-11-23").map((e) => e.id).join() === "s3" && episodesToDeliver(eps, "2026-11-27").length === 0, "一斉送信は、今日が配信日でURLのある回だけ");
  const r1 = subscribeReply(eps, "2026-11-22", true);
  ok(r1.includes(u("BBBBBBBBBBB")) && !r1.includes(u("CCCCCCCCCCC")) && r1.includes("お申し込みありがとうございます") && r1.includes("配信停止"), "初めての申込には、最新回のURL・次回からも送る案内・停止の方法を返す");
  const r2 = subscribeReply(eps, "2026-11-22", false);
  ok(r2.includes(u("BBBBBBBBBBB")) && !r2.includes("お申し込みありがとうございます"), "2回目以降はURLだけ（案内文は繰り返さない）");
  ok(subscribeReply(eps, "2026-11-10", true).includes("準備中"), "まだ動画がなければ「準備中」と返す");
  const withDraft = { ...eps[2], lineDraft: { text: `カスタム文面\n${u("CCCCCCCCCCC")}`, date: "", time: "", attachThumbnail: false, attachVideo: false, savedAt: "" } };
  ok(deliveryText(withDraft).startsWith("カスタム文面") && deliveryText(eps[2]).includes(u("CCCCCCCCCCC")) && deliveryText(eps[2]).includes("配信停止"), "一斉送信の文面は、URL入りの下書きがあればそれを使い、停止の方法を添える");
  const big = Array.from({ length: 1201 }, (_, i) => `U${i}`);
  ok(chunk(big).map((c) => c.length).join() === "500,500,201", "一斉送信は500人ずつに分けて送る");
  {
    const prev = process.env.LINE_CHANNEL_SECRET;
    process.env.LINE_CHANNEL_SECRET = "test-secret-for-check";
    const body = JSON.stringify({ events: [] });
    const sig = createHmac("sha256", "test-secret-for-check").update(body, "utf8").digest("base64");
    ok(verifyLineSignature(body, sig) && !verifyLineSignature(body + " ", sig) && !verifyLineSignature(body, null) && !verifyLineSignature(body, "AAAA"), "LINEからの通知は署名を確認し、改ざん・署名なしは受け付けない");
    if (prev === undefined) delete process.env.LINE_CHANNEL_SECRET;
    else process.env.LINE_CHANNEL_SECRET = prev;
    const k = retryKeyFor("ep1", 0);
    ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(k) && k === retryKeyFor("ep1", 0) && k !== retryKeyFor("ep1", 1), "再送キーは回とまとまりごとに常に同じ（再試行しても二重に届かない）");
  }
  ok(quotaAllows({ type: "limited", value: 200 }, 190, 10).ok && !quotaAllows({ type: "limited", value: 200 }, 195, 10).ok && quotaAllows({ type: "limited", value: 200 }, 195, 10).remaining === 5 && quotaAllows({ type: "none" }, 9999, 500).ok, "今月の残り通数が足りないときは送らない");
}

console.log(failed === 0 ? "\nすべて成功" : `\n${failed}件失敗`);
process.exit(failed ? 1 : 0);
