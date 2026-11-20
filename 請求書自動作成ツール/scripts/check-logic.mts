// ロジックの自動チェック（npm run check）。架空データのみ使用。
import { buildDayRows, draftFromRecord, isDirty, markAllPresent, absentRows, toRecord, addableMembers, statusOf } from "../src/lib/attendance";
import { summarizeMonth, unitPriceFor } from "../src/lib/billing";
import { createDemoData } from "../src/lib/demoData";
import { weekdayOf, daysInMonth, addMonths } from "../src/lib/dates";
import { changeSchedule, createMember, nextMemberId, restoreMember, withdrawMember, isScheduledOn, changeCopay, copayRatioFor, normalizeMember } from "../src/lib/members";
import { buildAttendanceSheet, toCsv, MARK } from "../src/lib/attendanceSheet";
import { buildSpreadsheetRequest } from "../src/lib/googleSheets";
import type { DayRecord, Member } from "../src/lib/types";

let failed = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failed++;
};
const T = "2026-01-01T00:00:00.000Z";
const mk = (members: Member[], name: string, weekdays: number[], from = "2026-01-01") =>
  createMember(members, { name, weekdays, from }, T);

// 架空の会員
let members: Member[] = [];
const add = (name: string, w: number[]) => {
  const m = mk(members, name, w);
  members = [...members, m];
  return m;
};
const a = add("架空 一郎", [1, 3]); // 月・水
const b = add("架空 二郎", [2, 4]); // 火・木
const c = add("架空 三子", [1]); // 月
const c2 = add("架空 三子", [3]); // 同姓同名
const days: Record<string, DayRecord> = {};
const names = (rows: { member: Member }[]) => rows.map((r) => r.member.id).join(",");

console.log("\n1. 曜日ごとの利用予定者");
ok(weekdayOf("2026-11-16") === 1, "2026-11-16 は月曜");
ok(names(buildDayRows(members, "2026-11-16", null)).split(",").sort().join() === [a.id, c.id].sort().join(), "月曜：一郎・三子(月)の2名");
ok(names(buildDayRows(members, "2026-11-18", null)).includes(c2.id) && buildDayRows(members, "2026-11-18", null).length === 2, "水曜：一郎・三子(水)の2名");
ok(buildDayRows(members, "2026-11-22", null).length === 0, "日曜：0名");
ok(c.id !== c2.id && c.name === c2.name, `同姓同名は別の会員ID（${c.id} / ${c2.id}）`);
ok(nextMemberId(members) === "M0005", "次の会員IDは M0005");

console.log("\n2. 全員利用 → 一部だけ欠席");
let date = "2026-11-16";
let rows = buildDayRows(members, date, null);
let draft = draftFromRecord(null);
ok(rows.every((r) => statusOf(draft, r.member.id) === "unconfirmed"), "最初は全員「未確認」（欠席ではない）");
draft = markAllPresent(draft, rows, false);
ok(rows.every((r) => statusOf(draft, r.member.id) === "present"), "全員利用で全員「利用」");
ok(isDirty(null, rows, draft), "全員利用を押しただけでは未保存");
draft = { ...draft, [c.id]: "absent" };
ok(statusOf(draft, c.id) === "absent" && statusOf(draft, a.id) === "present", "三子だけ欠席に変更できる");
ok(absentRows(draft, rows).length === 1, "もう一度全員利用 → 欠席1名の確認が必要");
ok(statusOf(markAllPresent(draft, rows, false), c.id) === "absent", "「欠席はそのまま」を選ぶと欠席のまま");
ok(statusOf(markAllPresent(draft, rows, true), c.id) === "present", "「欠席も含めて」を選ぶと利用に変わる");
days[date] = toRecord(date, rows, draft, "2026-11-16T09:00:00Z");
ok(!isDirty(days[date], rows, draft), "保存後は未保存の変更なし");

console.log("\n3. 振替の会員を追加して利用を記録");
date = "2026-11-17"; // 火曜：二郎
ok(addableMembers(members, buildDayRows(members, date, null), date).some((m) => m.id === a.id), "火曜の追加候補に一郎がいる");
rows = buildDayRows(members, date, null, [a.id]);
const addedRow = rows.find((r) => r.member.id === a.id)!;
ok(addedRow.added, "追加した一郎に「追加」の印");
draft = draftFromRecord(null);
ok(statusOf(draft, a.id) === "unconfirmed", "追加しただけでは利用にならない（未確認）");
ok(isDirty(null, rows, draft), "追加しただけでも未保存扱い");
draft = { [a.id]: "present", [b.id]: "present" };
days[date] = toRecord(date, rows, draft, "2026-11-17T09:00:00Z");
const reopened = buildDayRows(members, date, days[date]);
ok(reopened.some((r) => r.member.id === a.id && r.added), "保存後に開き直しても一郎が表示される");

console.log("\n4. 過去の記録を修正");
date = "2026-11-16";
rows = buildDayRows(members, date, days[date]);
draft = draftFromRecord(days[date]);
ok(statusOf(draft, c.id) === "absent", "保存済みの内容（三子＝欠席）が表示される");
draft = { ...draft, [c.id]: "present" };
ok(isDirty(days[date], rows, draft), "変更すると未保存表示");
days[date] = toRecord(date, rows, draft, "2026-11-20T09:00:00Z");
ok(draftFromRecord(days[date])[c.id] === "present", "再保存で三子＝利用に修正された");

console.log("\n5. 利用曜日を変更しても過去の記録が残る");
const a2 = changeSchedule(a, [2, 4], "2026-12-01", T); // 12/1から火・木
members = members.map((m) => (m.id === a.id ? a2 : m));
ok(isScheduledOn(a2, "2026-11-30") && !isScheduledOn(a2, "2026-12-07"), "11/30(月)は予定あり、12/7(月)は予定なし");
ok(isScheduledOn(a2, "2026-12-01"), "12/1(火)から予定あり");
ok(a2.schedules.length === 2, "変更前の曜日設定も履歴に残る");
ok(days["2026-11-16"].entries.some((e) => e.memberId === a.id && e.status === "present"), "11/16の保存済み記録はそのまま");
const a3 = changeSchedule(a2, [5], "2026-12-01", T);
ok(a3.schedules.length === 2 && a3.schedules[1].weekdays.join() === "5", "同じ開始日で変更すると置き換え（週2回→週1回）");
const a4 = changeSchedule(a2, [1], "2026-11-25", T);
ok(a4.schedules.length === 2 && a4.schedules[1].from === "2026-11-25", "より前の日付で変更すると、後の変更予定は取り消し");
// 過去の日付の表示：曜日変更後でも保存済みの会員は表示
const aChangedPast = changeSchedule(a, [5], "2026-11-01", T);
const rowsPast = buildDayRows(members.map((m) => (m.id === a.id ? aChangedPast : m)), "2026-11-16", days["2026-11-16"]);
ok(rowsPast.some((r) => r.member.id === a.id), "さかのぼって曜日を変えても、保存済みの日には表示される");

console.log("\n6. 月の利用日・回数・金額");
days["2026-11-18"] = { date: "2026-11-18", savedAt: T, entries: [
  { memberId: a.id, status: "unconfirmed", added: false },
  { memberId: c2.id, status: "absent", added: false },
] };
days["2026-10-31"] = { date: "2026-10-31", savedAt: T, entries: [{ memberId: a.id, status: "present", added: true }] };
const s = summarizeMonth(members, Object.values(days), "2026-11", "2026-11-20");
const rowA = s.rows.find((r) => r.member.id === a.id)!;
ok(rowA.usedDates.join() === "2026-11-16,2026-11-17", "一郎の11月の利用日は 16日・17日（他の月は含まない）");
ok(rowA.count === 2 && rowA.amount === 716, "一郎：2回 × 358円 = 716円");
ok(rowA.unconfirmedDates.join() === "2026-11-18", "未確認(18日)は回数に含めず、注意表示の対象");
const rowC2 = s.rows.find((r) => r.member.id === c2.id)!;
ok(rowC2.count === 0 && rowC2.amount === 0, "欠席は回数に含めない");
ok(s.totalCount === 4 && s.totalAmount === 4 * 358, `11月合計：${s.totalCount}回 ${s.totalAmount}円`);
ok(unitPriceFor("2026-11") === 358, "単価は設定ファイルの358円");
ok(s.unsavedDates.includes("2026-11-02") && !s.unsavedDates.includes("2026-11-16"), "保存していない利用日を検出");

console.log("\n7. 退会後も過去の記録が残る");
const bW = withdrawMember(b, "2026-11-19", T);
members = members.map((m) => (m.id === b.id ? bW : m));
ok(!buildDayRows(members, "2026-11-19", null).some((r) => r.member.id === b.id), "退会日(11/19木)から予定に出ない");
ok(!buildDayRows(members, "2026-11-26", null).some((r) => r.member.id === b.id), "その後の木曜も出ない");
ok(buildDayRows(members, "2026-11-17", days["2026-11-17"]).some((r) => r.member.id === b.id), "退会前の11/17の記録は表示される");
const s2 = summarizeMonth(members, Object.values(days), "2026-11", "2026-11-20");
ok(s2.rows.find((r) => r.member.id === b.id)?.count === 1, "退会後も11月の請求対象（1回）が残る");
ok(!addableMembers(members, [], "2026-11-26").some((m) => m.id === b.id), "退会後は追加候補にも出ない");
const bR = restoreMember(bW, T);
ok(isScheduledOn(bR, "2026-11-26"), "利用中に戻すと予定に戻る");

console.log("\n8. 架空データ（デモ）");
const demo = createDemoData(new Date(2026, 10, 20, 9, 0));
ok(demo.members.length === 30, "架空の会員30名");
const prev = addMonths("2026-11", -1);
const ds = summarizeMonth(demo.members, demo.days, prev, "2026-11-20");
const billable = ds.rows.filter((r) => r.count > 0);
ok(billable.length >= 25, `先月の請求書対象 ${billable.length}名（まとめて印刷の対象）`);
ok(ds.rows.every((r) => r.amount === r.count * unitPriceFor(prev, r.ratio)), "全員 金額＝回数×その方の負担割合の単価");
ok(ds.unsavedDates.length === 0, "先月は全日保存済み");
const maeda = demo.members.find((m) => m.name === "前田 隆")!;
ok(ds.rows.some((r) => r.member.id === maeda.id && r.count > 0), "退会者（前田）の先月分の記録が残る");
ok(!daysInMonth("2026-11").some((d) => d >= "2026-11-01" && isScheduledOn(maeda, d)), "退会者は今月の予定に出ない");
const nishida = demo.members.find((m) => m.name === "西田 静子")!;
ok(isScheduledOn(nishida, "2026-10-05") && !isScheduledOn(nishida, "2026-11-02") && isScheduledOn(nishida, "2026-11-03"), "西田：10月は月曜、11月から火・木");
ok(!demo.days.some((d) => d.date >= "2026-11-20"), "今日以降の記録は作らない");

console.log("\n9. 介護保険の負担割合（1割・2割・3割）");
ok(unitPriceFor("2026-11", 1) === 358 && unitPriceFor("2026-11", 2) === 716 && unitPriceFor("2026-11", 3) === 1074, "単価：1割358円・2割716円・3割1074円");
ok(a.copays.length === 1 && copayRatioFor(a, "2026-11") === 1, "登録時に選ばなければ1割");
const d3 = createMember(members, { name: "架空 三割", weekdays: [1], from: "2026-11-01", copayRatio: 3 }, T);
ok(copayRatioFor(d3, "2026-11") === 3 && d3.copays[0].from === "2026-11", "登録時に3割を選べる（利用開始月から）");
// 一郎を 12月分から 2割に変更 → 11月は1割のまま、12月は2割
const aR = changeCopay(members.find((m) => m.id === a.id)!, 2, "2026-12", T);
ok(copayRatioFor(aR, "2026-11") === 1 && copayRatioFor(aR, "2026-12") === 2, "12月分から2割：11月は1割のまま、12月は2割");
const membersR = members.map((m) => (m.id === a.id ? aR : m));
const sNov = summarizeMonth(membersR, Object.values(days), "2026-11", "2026-11-20");
ok(sNov.rows.find((r) => r.member.id === a.id)!.amount === 716, "変更前の11月の請求額は 2回×358円＝716円のまま");
days["2026-12-01"] = { date: "2026-12-01", savedAt: T, entries: [{ memberId: a.id, status: "present", added: false }] };
days["2026-12-03"] = { date: "2026-12-03", savedAt: T, entries: [{ memberId: a.id, status: "present", added: false }] };
const sDec = summarizeMonth(membersR, Object.values(days), "2026-12", "2026-12-20");
const rowDec = sDec.rows.find((r) => r.member.id === a.id)!;
ok(rowDec.ratio === 2 && rowDec.unitPrice === 716 && rowDec.amount === 1432, "12月：2割 2回×716円＝1432円");
const aR3 = changeCopay(aR, 3, "2026-11", T);
ok(aR3.copays.length === 2 && copayRatioFor(aR3, "2026-12") === 3, "より前の月で変更すると、後の変更予定は取り消し");
const oldData = { ...a } as Partial<Member>;
delete oldData.copays;
ok(copayRatioFor(normalizeMember(oldData as Member), "2026-11") === 1, "負担割合のない古いデータは1割として扱う");
const d2 = demo.members.find((m) => m.name === "高橋 節子")!;
ok(copayRatioFor(d2, "2026-10") === 1 && copayRatioFor(d2, "2026-11") === 2, "デモ：高橋さんは10月1割、11月から2割");
const dsNow = summarizeMonth(demo.members, demo.days, "2026-11", "2026-11-20");
const kubo = dsNow.rows.find((r) => r.member.name === "久保 文子")!;
ok(kubo.ratio === 3 && kubo.amount === kubo.count * 1074, `デモ：久保さん3割 ${kubo.count}回×1074円`);

console.log("\n10. 出欠表（CSV・スプレッドシート）");
const sheet = buildAttendanceSheet(sNov);
ok(sheet.header[0] === "氏名" && sheet.header[2] === "1(日)" && sheet.header[31] === "30(月)", "見出し：氏名、1(日) 〜 30(月)");
ok(sheet.header.length === 2 + 30 + 4, "列：氏名・会員番号＋30日分＋回数・割合・単価・金額");
const rowSheetA = sheet.rows.find((r) => r[1] === a.id)!;
ok(rowSheetA[2 + 15] === MARK && rowSheetA[2 + 16] === MARK, "一郎：16日・17日に○");
ok(rowSheetA[2 + 17] === null, "未確認(18日)には○を付けない");
ok(sheet.rows.find((r) => r[1] === c2.id)![2 + 17] === null, "欠席には○を付けない");
ok(sheet.total[2 + 15] === 2 && sheet.total[2 + 16] === 2, "合計行：16日・17日は各2名");
ok(sheet.total[sheet.total.length - 1] === sNov.totalAmount, "合計行の金額＝集計の合計");
const csv = toCsv(sheet);
const csvLines = csv.split("\r\n");
ok(csv.charCodeAt(0) === 0xfeff, "CSV：先頭にBOM（表計算ソフトで文字化けしない）");
ok(csvLines.length === sheet.rows.length + 3 && csvLines[csvLines.length - 1] === "", "CSV：改行はCRLF、見出し＋会員＋合計の行数");
ok(csvLines[0].slice(1).startsWith("氏名,会員番号,1(日),2(月)"), "CSV：1行目は 氏名,会員番号,1(日),...");
const tricky = buildAttendanceSheet(summarizeMonth([{ ...a, name: '架空, "あだ名"' }], Object.values(days), "2026-11", "2026-11-20"));
ok(toCsv(tricky).includes('"架空, ""あだ名"""'), "CSV：カンマや \" を含む名前は正しく囲む");
const req = buildSpreadsheetRequest(sheet, { fileTitle: "出欠表_2026年11月（テスト）", sheetTitle: "2026年11月" });
const grid = req.sheets[0].properties.gridProperties;
ok(grid.frozenRowCount === 2 && grid.frozenColumnCount === 2, "スプレッドシート：表題・見出しの2行と、氏名・会員番号の2列を固定");
ok(req.sheets[0].properties.title === "2026年11月" && req.properties.title === "出欠表_2026年11月（テスト）", "スプレッドシート：ファイル名とシート名");
const rd = req.sheets[0].data[0].rowData;
ok(rd.length === grid.rowCount && rd.length === sheet.rows.length + 3 && grid.columnCount === sheet.header.length, "スプレッドシート：行数・列数が表と一致（表題＋見出し＋会員＋合計）");
ok(rd[1].values[0].userEnteredValue?.stringValue === "氏名" && rd[1].values[2].userEnteredValue?.stringValue === "1(日)", "スプレッドシート：2行目が見出し");
const reqRowA = rd.find((r) => r.values[1]?.userEnteredValue?.stringValue === a.id)!;
ok(reqRowA.values[2 + 15].userEnteredValue?.stringValue === MARK && reqRowA.values[2 + 17].userEnteredValue === undefined, "スプレッドシート：16日に○、未確認の18日は空欄");
const lastRow = rd[rd.length - 1].values;
ok(lastRow[lastRow.length - 1].userEnteredValue?.numberValue === sNov.totalAmount, "スプレッドシート：合計の金額は数値で入る");
ok(req.sheets[0].data[0].columnMetadata.length === sheet.header.length, "スプレッドシート：全列の幅を指定");

console.log(failed ? `\n✗ ${failed}件 失敗` : "\nすべて成功");
process.exit(failed ? 1 : 0);
