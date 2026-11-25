import { useState } from 'react';
import { ListFilter } from 'lucide-react';
import { ghostButton, inputClass } from '@/components/ui';

const NEW = '\u0000new';

interface Props {
  value: string;
  categories: string[];
  onChange: (v: string) => void;
  /** 一覧の追加欄などで使う小さい表示 */
  compact?: boolean;
}

/** 一度作った分類は一覧から選ぶ。新しい分類は「＋ 新しい分類を作る」から入力する */
export function CategorySelect({ value, categories, onChange, compact = false }: Props) {
  const field = compact ? `${inputClass} w-auto min-w-0 max-w-[11rem] py-1 text-xs` : inputClass;
  const known = value.trim() === '' || categories.includes(value.trim());
  const [creating, setCreating] = useState(!known);

  if (creating || categories.length === 0) {
    return (
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={categories.length === 0 ? '分類名（空欄なら未分類）' : '新しい分類名'}
          className={field}
          maxLength={30}
          autoFocus={creating}
          aria-label="分類"
        />
        {categories.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              onChange('');
            }}
            className={`${ghostButton} shrink-0 ${compact ? 'px-2 py-1' : 'py-1.5'} text-xs`}
          >
            <ListFilter className="h-3.5 w-3.5" />
            {compact ? '一覧' : '一覧から選ぶ'}
          </button>
        )}
      </div>
    );
  }

  return (
    <select
      value={value.trim()}
      onChange={(e) => {
        if (e.target.value === NEW) {
          setCreating(true);
          onChange('');
        } else onChange(e.target.value);
      }}
      className={field}
      aria-label="分類"
    >
      <option value="">未分類</option>
      {categories.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      <option value={NEW}>＋ 新しい分類を作る</option>
    </select>
  );
}
