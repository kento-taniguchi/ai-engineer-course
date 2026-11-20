// アプリ全体の設定値はここにまとめます（金額や事業所名を変えるときは、このファイルだけを直します）

/**
 * 1回あたりの利用料（円）。
 * 単価が変わるときは、行を追加します（過去の月の請求額は変わりません）。
 * 例：2027年4月分から400円 → { from: "2027-04", price: 400 } を追加
 */
export const UNIT_PRICES: { from: string; price: number }[] = [
  { from: "2000-01", price: 358 },
];

/** 請求書に表示する事業所情報（試作版は架空） */
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
