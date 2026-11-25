import { useState } from 'react';
import { Check, Eye, EyeOff, Palette } from 'lucide-react';
import { PALETTE, type CategoryColor } from '@/lib/colors';

/** 未分類を表すキー（分類名と重ならない文字） */
export const NO_CATEGORY = '\u0000none';

interface Props {
  categories: string[];
  hidden: string[];
  onToggle: (key: string) => void;
  onShowAll: () => void;
  colorOf: (category: string) => CategoryColor;
  onSetColor: (name: string, colorKey: string) => void;
}

/** カレンダー上部の凡例：押すとその分類の表示・非表示を切り替える。「色」で分類の色を変える */
export function CategoryLegend({ categories, hidden, onToggle, onShowAll, colorOf, onSetColor }: Props) {
  const [editing, setEditing] = useState(false);
  const items = [...categories.map((c) => ({ key: c, label: c })), { key: NO_CATEGORY, label: '未分類' }];

  return (
    <div className="border-b border-navy-100 px-3 py-1.5">
      <div className="flex items-center gap-1.5">
        <div className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 py-0.5">
          {items.map((it) => {
            const off = hidden.includes(it.key);
            const color = colorOf(it.key === NO_CATEGORY ? '' : it.key);
            return (
              <button
                key={it.key}
                type="button"
                onClick={() => onToggle(it.key)}
                aria-pressed={!off}
                title={off ? `${it.label}を表示する` : `${it.label}を隠す`}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold transition ${
                  off ? 'border-dashed border-slate-300 bg-white text-slate-400' : 'border-transparent text-slate-700'
                }`}
                style={off ? undefined : { backgroundColor: color.soft }}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: off ? 'transparent' : color.solid, boxShadow: off ? `inset 0 0 0 1.5px ${color.solid}` : undefined }}
                  aria-hidden
                />
                {it.label}
                {off && <EyeOff className="h-3 w-3" aria-hidden />}
              </button>
            );
          })}
        </div>
        {hidden.length > 0 && (
          <button
            type="button"
            onClick={onShowAll}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-navy-400 hover:bg-navy-50 hover:text-navy"
          >
            <Eye className="h-3.5 w-3.5" aria-hidden />
            全部表示
          </button>
        )}
        {categories.length > 0 && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-expanded={editing}
            className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition ${
              editing ? 'bg-navy text-white' : 'text-navy-400 hover:bg-navy-50 hover:text-navy'
            }`}
          >
            <Palette className="h-3.5 w-3.5" aria-hidden />色
          </button>
        )}
      </div>

      {editing && (
        <ul className="mt-2 space-y-1.5 rounded-xl border border-navy-100 bg-canvas p-2.5">
          {categories.map((c) => {
            const current = colorOf(c);
            return (
              <li key={c} className="flex flex-wrap items-center gap-2">
                <span className="w-28 truncate text-xs font-bold text-slate-700" title={c}>
                  {c}
                </span>
                <div className="flex gap-1" role="radiogroup" aria-label={`${c}の色`}>
                  {PALETTE.map((p) => {
                    const on = p.key === current.key;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={p.label}
                        title={p.label}
                        onClick={() => onSetColor(c, p.key)}
                        className={`flex h-6 w-6 items-center justify-center rounded-full transition hover:scale-110 ${
                          on ? 'ring-2 ring-navy ring-offset-1' : ''
                        }`}
                        style={{ backgroundColor: p.solid }}
                      >
                        {on && <Check className="h-3.5 w-3.5 text-white" aria-hidden />}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
          <li className="pt-1 text-[11px] text-slate-500">未分類はディープブルー、期限切れは赤で表示します。</li>
        </ul>
      )}
    </div>
  );
}
