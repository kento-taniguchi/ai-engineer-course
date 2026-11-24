/** 「未分類」タブを表す値（実際の分類名と重ならない文字） */
export const UNCATEGORIZED = '\u0000uncategorized';

/** 選んだ分類のテンプレートだけにする（選んでいた分類が無くなっていたら全部） */
export function filterByCategory<T extends { category: string }>(items: T[], categories: string[], value: string) {
  if (value === UNCATEGORIZED) {
    const rest = items.filter((t) => !t.category.trim());
    return rest.length && categories.length ? rest : items;
  }
  if (value === '' || !categories.includes(value)) return items;
  return items.filter((t) => t.category.trim() === value);
}
