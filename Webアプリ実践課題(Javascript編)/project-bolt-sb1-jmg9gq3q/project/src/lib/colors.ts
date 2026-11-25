/**
 * 分類（事業）ごとのカレンダーの色。
 * 赤（期限切れ）とオレンジ（ボタン・強調）とは見分けがつく色だけを使い、
 * どれも白い文字との濃さの差が 4.5 以上になるようにしている。
 */
export interface CategoryColor {
  key: string;
  label: string;
  /** 予定の背景（白い文字をのせる） */
  solid: string;
  /** 薄い背景（目印・タグ用） */
  soft: string;
}

export const PALETTE: CategoryColor[] = [
  { key: 'teal', label: '青緑', solid: '#0F766E', soft: '#CCFBF1' },
  { key: 'violet', label: 'むらさき', solid: '#6D28D9', soft: '#EDE9FE' },
  { key: 'emerald', label: 'みどり', solid: '#047857', soft: '#D1FAE5' },
  { key: 'sky', label: '空色', solid: '#0369A1', soft: '#E0F2FE' },
  { key: 'fuchsia', label: '赤むらさき', solid: '#A21CAF', soft: '#FAE8FF' },
  { key: 'cyan', label: '水色', solid: '#155E75', soft: '#CFFAFE' },
  { key: 'slate', label: 'グレー', solid: '#475569', soft: '#E2E8F0' },
  { key: 'indigo', label: '藍色', solid: '#4338CA', soft: '#E0E7FF' },
];

/** 未分類はメインカラー（ディープブルー） */
export const UNCATEGORIZED_COLOR: CategoryColor = { key: 'navy', label: 'ディープブルー', solid: '#1E3A8A', soft: '#DFE7F6' };

export const paletteOf = (key: string | undefined) => PALETTE.find((c) => c.key === key) ?? null;

/** まだ使われていない色から順に選ぶ（全部使ったら最初から） */
export function nextColorKey(used: string[]) {
  const free = PALETTE.find((c) => !used.includes(c.key));
  return (free ?? PALETTE[used.length % PALETTE.length]).key;
}
