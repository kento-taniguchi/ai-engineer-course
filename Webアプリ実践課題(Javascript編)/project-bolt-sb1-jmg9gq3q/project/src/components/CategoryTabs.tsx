import { UNCATEGORIZED } from '@/lib/category';

interface Props {
  categories: string[];
  hasUncategorized: boolean;
  /** '' = すべて */
  value: string;
  onChange: (v: string) => void;
  size?: 'sm' | 'md';
}

/** 分類（野球事業・AI事業など）で切り替えるタブ */
export function CategoryTabs({ categories, hasUncategorized, value, onChange, size = 'md' }: Props) {
  const tabs = [
    { key: '', label: 'すべて' },
    ...categories.map((c) => ({ key: c, label: c })),
    ...(hasUncategorized && categories.length > 0 ? [{ key: UNCATEGORIZED, label: '未分類' }] : []),
  ];
  // 選んでいた分類が無くなったら「すべて」を選んでいる扱いにする
  const current = tabs.some((t) => t.key === value) ? value : '';
  if (tabs.length <= 1) return null;

  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5" role="tablist" aria-label="分類">
      {tabs.map((t) => (
        <button
          key={t.key || 'all'}
          role="tab"
          aria-selected={current === t.key}
          onClick={() => onChange(t.key)}
          className={`shrink-0 whitespace-nowrap rounded-full border font-bold transition ${
            size === 'sm' ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
          } ${
            current === t.key
              ? 'border-navy bg-navy text-white'
              : 'border-navy-100 bg-white text-navy-300 hover:border-navy-200 hover:text-navy'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
