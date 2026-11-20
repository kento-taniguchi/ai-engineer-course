// 試作版の架空データ（実在の人物とは関係ありません）
import { addDays, addMonths, daysInMonth, monthOf, todayKey, weekdayOf } from "./dates";
import { isScheduledOn } from "./members";
import type { DateKey, DayEntry, DayRecord, Member } from "./types";

// [氏名, ふりがな, 曜日]  0=日 1=月 ... 6=土
const PEOPLE: [string, string, number[]][] = [
  ["青山 一郎", "あおやま いちろう", [1, 3]],
  ["石田 和子", "いしだ かずこ", [2, 4]],
  ["上野 健二", "うえの けんじ", [1, 3, 5]],
  ["江口 春江", "えぐち はるえ", [5]],
  ["大川 正男", "おおかわ まさお", [2, 5]],
  ["加藤 光子", "かとう みつこ", [1, 4]],
  ["木村 清", "きむら きよし", [3]],
  ["久保 文子", "くぼ ふみこ", [2, 4, 6]],
  ["小島 進", "こじま すすむ", [1, 5]],
  ["佐藤 花子", "さとう はなこ", [1, 3]],
  ["佐藤 花子", "さとう はなこ", [2, 6]],
  ["清水 茂", "しみず しげる", [4]],
  ["鈴木 幸子", "すずき さちこ", [1, 2, 3, 4, 5]],
  ["瀬戸 昭", "せと あきら", [3, 6]],
  ["高橋 節子", "たかはし せつこ", [2, 5]],
  ["田村 勇", "たむら いさむ", [1, 4]],
  ["千葉 和夫", "ちば かずお", [6]],
  ["土屋 美代子", "つちや みよこ", [3, 5]],
  ["中村 弘", "なかむら ひろし", [2, 4]],
  ["西田 静子", "にしだ しずこ", [1]],
  ["野口 実", "のぐち みのる", [3, 5]],
  ["浜田 洋子", "はまだ ようこ", [2, 6]],
  ["平野 博", "ひらの ひろし", [1, 3, 5]],
  ["福田 千代", "ふくだ ちよ", [4]],
  ["前田 隆", "まえだ たかし", [2]],
  ["三浦 恵子", "みうら けいこ", [1, 4]],
  ["村上 修", "むらかみ おさむ", [5, 6]],
  ["森 久美子", "もり くみこ", [2, 3]],
  ["山口 豊", "やまぐち ゆたか", [1, 5]],
  ["吉田 トメ", "よしだ とめ", [4, 6]],
];

/** 決まった順番で出る乱数（毎回同じデモになるように） */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

export function createDemoData(now: Date = new Date()): { members: Member[]; days: DayRecord[] } {
  const today = todayKey(now);
  const thisMonth = monthOf(today);
  const start = `${addMonths(thisMonth, -2)}-01`;
  const nowIso = now.toISOString();

  const members: Member[] = PEOPLE.map(([name, kana, weekdays], i) => ({
    id: `M${String(i + 1).padStart(4, "0")}`,
    name,
    kana,
    schedules: [{ from: "2020-04-01", weekdays }],
    withdrawnOn: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  }));

  // 曜日変更の例：西田 静子さん 今月1日から「月」→「火・木」
  const nishida = members.find((m) => m.name === "西田 静子")!;
  nishida.schedules.push({ from: `${thisMonth}-01`, weekdays: [2, 4] });
  // 退会の例：前田 隆さん 先月16日に退会
  const maeda = members.find((m) => m.name === "前田 隆")!;
  maeda.withdrawnOn = `${addMonths(thisMonth, -1)}-16`;

  // 先々月1日〜昨日の出欠記録
  const rand = seeded(20261120);
  const days: DayRecord[] = [];
  const allDays = [addMonths(thisMonth, -2), addMonths(thisMonth, -1), thisMonth].flatMap(daysInMonth);
  const yesterday = addDays(today, -1);
  for (const date of allDays) {
    if (date < start || date > yesterday) continue;
    const entries: DayEntry[] = [];
    for (const m of members) {
      if (!isScheduledOn(m, date)) continue;
      const r = rand();
      entries.push({ memberId: m.id, status: r < 0.1 ? "absent" : "present", added: false });
    }
    if (entries.length === 0) continue;
    days.push({ date, entries, savedAt: `${date}T17:00:00.000+09:00` });
  }
  // 振替の例：先月の2週目の土曜日に 木村 清さん（通常は水曜）が追加で利用
  const kimura = members.find((m) => m.name === "木村 清")!;
  const sat = days.find((d) => monthOf(d.date) === addMonths(thisMonth, -1) && weekdayOf(d.date) === 6 && Number(d.date.slice(8)) > 7);
  sat?.entries.push({ memberId: kimura.id, status: "present", added: true });
  // 未確認のまま保存された例：今月最初の記録日の先頭の方
  const firstThisMonth = days.find((d) => monthOf(d.date) === thisMonth);
  if (firstThisMonth?.entries[0]) firstThisMonth.entries[0].status = "unconfirmed";

  return { members, days };
}
