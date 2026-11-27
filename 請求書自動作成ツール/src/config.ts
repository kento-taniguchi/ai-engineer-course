// アプリ全体の設定値はここにまとめます（金額や事業所名を変えるときは、このファイルだけを直します）
import type { CopayRatio, TimeSlot } from "@/lib/types";

/**
 * 1回あたりの利用料（円）。介護保険の自己負担割合（1割・2割・3割）ごとに決めます。
 * 単価が変わるときは、行を追加します（過去の月の請求額は変わりません）。
 * 例：2027年4月分から変わる → { from: "2027-04", prices: { 1: 400, 2: 800, 3: 1200 } } を追加
 */
export const UNIT_PRICES: { from: string; prices: Record<CopayRatio, number> }[] = [
  { from: "2000-01", prices: { 1: 358, 2: 716, 3: 1074 } },
];

/** 選べる負担割合 */
export const COPAY_RATIOS: readonly CopayRatio[] = [1, 2, 3];

/** アプリの名前（画面の上部・ブラウザのタブに表示） */
export const APP_NAME = "利用記録・請求書ツール";

/** 請求書に表示する事業所情報（試作版は架空。正式なひな形を入手したら本当の事業所情報にする） */
export const OFFICE = {
  name: "ひだまりデイサービス（デモ）",
  address: "〒000-0000 架空県架空市1-2-3",
  tel: "000-000-0000",
  isDemo: true,
};

/** 曜日の表示（0=日曜） */
export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** 会員登録画面で表示する曜日の順番（月曜始まり） */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** 利用する時間帯（出欠の画面は、この順番で分けて表示します） */
export const TIME_SLOTS: Record<TimeSlot, { label: string; time: string }> = {
  am: { label: "午前", time: "10:30〜12:00" },
  pm: { label: "午後", time: "14:30〜16:00" },
};
export const TIME_SLOT_ORDER: readonly TimeSlot[] = ["am", "pm"];
