import { useState } from 'react';
import { ArrowLeft, Copy, CornerDownRight, FileText, Layers, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import type { ItemTiming, Priority, TaskTemplate, TemplateItem } from '@/lib/supabase';
import { DURATION_OPTIONS, formatDuration } from '@/lib/date';
import { DAY_OFFSETS, PRIORITIES, dayLabel, priorityMeta, timingLabel } from '@/lib/tasks';
import { Field, Modal, ghostButton, inputClass, primaryButton } from '@/components/ui';
import { CategoryTabs } from '@/components/CategoryTabs';
import { UNCATEGORIZED, filterByCategory } from '@/lib/category';
import { useLocalStorage } from '@/hooks/useLocalStorage';

interface Draft {
  id?: string;
  name: string;
  category: string;
  items: TemplateItem[];
}

const blankItem = (sub = false): TemplateItem => ({
  title: '',
  priority: 2,
  duration_minutes: sub ? 15 : 60,
  timing: sub ? { kind: 'offset', minutes: 60 } : { kind: 'none' },
});

const copyItems = (items: TemplateItem[]) => items.map((i) => ({ ...i, timing: { ...i.timing } as ItemTiming }));

type Mode = 'none' | 'before' | 'after' | 'day';

/** サブタスクの時刻：時間指定なし／実施の○時間○分前・後／前日・当日・翌日などの○時○分 */
function TimingInput({ value, onChange }: { value: ItemTiming; onChange: (t: ItemTiming) => void }) {
  const mode: Mode = value.kind === 'none' ? 'none' : value.kind === 'day' ? 'day' : value.minutes < 0 ? 'before' : 'after';
  const abs = value.kind === 'offset' ? Math.abs(value.minutes) : 60;
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  const sel = `${inputClass} w-auto py-1 text-xs`;

  const setOffset = (h: number, m: number, m2: Mode = mode) => {
    const total = Math.max(0, h) * 60 + m;
    onChange({ kind: 'offset', minutes: m2 === 'before' ? -total : total });
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <select
        value={mode}
        onChange={(e) => {
          const m = e.target.value as Mode;
          if (m === 'none') onChange({ kind: 'none' });
          else if (m === 'day') onChange({ kind: 'day', days: 0, time: '09:00' });
          else setOffset(hours, mins, m);
        }}
        className={sel}
        aria-label="時刻の決め方"
      >
        <option value="after">実施の○時間後</option>
        <option value="before">実施の○時間前</option>
        <option value="day">日付と時刻で指定</option>
        <option value="none">時間指定なし</option>
      </select>

      {(mode === 'before' || mode === 'after') && (
        <>
          <input
            type="number"
            min={0}
            max={168}
            value={hours}
            onChange={(e) => setOffset(Math.min(168, Number(e.target.value) || 0), mins)}
            className={`${inputClass} w-14 py-1 text-xs`}
            aria-label="時間"
          />
          時間
          <select value={mins} onChange={(e) => setOffset(hours, Number(e.target.value))} className={sel} aria-label="分">
            {[0, 5, 10, 15, 20, 30, 45].map((m) => (
              <option key={m} value={m}>
                {m}分
              </option>
            ))}
          </select>
          {mode === 'before' ? '前' : '後'}
        </>
      )}

      {value.kind === 'day' && (
        <>
          <select
            value={value.days}
            onChange={(e) => onChange({ ...value, days: Number(e.target.value) })}
            className={sel}
            aria-label="何日"
          >
            {DAY_OFFSETS.map((d) => (
              <option key={d} value={d}>
                {dayLabel(d)}
              </option>
            ))}
          </select>
          の
          <input
            type="time"
            value={value.time}
            onChange={(e) => e.target.value && onChange({ ...value, time: e.target.value })}
            className={sel}
            aria-label="時刻"
          />
        </>
      )}
    </span>
  );
}

interface Props {
  templates: TaskTemplate[];
  categories: string[];
  onCreate: (name: string, category: string, items: TemplateItem[]) => Promise<boolean>;
  onUpdate: (id: string, name: string, category: string, items: TemplateItem[]) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onApply: (t: TaskTemplate) => void;
  onClose: () => void;
}

export function TemplateManager({ templates, categories, onCreate, onUpdate, onDelete, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tab, setTab] = useLocalStorage<string>('todo.managerCategory', '');
  const [saving, setSaving] = useState(false);

  const validItems = draft ? draft.items.filter((i) => i.title.trim()) : [];
  const canSave = !!draft && !!draft.name.trim() && !!draft.items[0]?.title.trim();

  const save = async () => {
    if (!draft || !canSave) return;
    setSaving(true);
    const items = validItems.map((i) => ({ ...i, title: i.title.trim() }));
    const name = draft.name.trim();
    const cat = draft.category.trim();
    const ok = draft.id ? await onUpdate(draft.id, name, cat, items) : await onCreate(name, cat, items);
    setSaving(false);
    if (ok) setDraft(null);
  };

  const setItem = (idx: number, patch: Partial<TemplateItem>) =>
    setDraft((d) => (d ? { ...d, items: d.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) } : d));

  if (draft) {
    return (
      <Modal
        title={draft.id ? 'テンプレートを編集' : 'テンプレートを作成'}
        onClose={() => setDraft(null)}
        wide
        footer={
          <>
            <button onClick={() => setDraft(null)} className={ghostButton}>
              <ArrowLeft className="h-4 w-4" />
              戻る
            </button>
            <div className="flex-1" />
            <button onClick={() => void save()} disabled={!canSave || saving} className={primaryButton}>
              保存
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="名前（例：BASE-PLUS 対面パーソナル）">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className={inputClass}
              maxLength={60}
              autoFocus
            />
          </Field>

          <Field label="分類（例：野球事業、高齢者事業、AI事業、物販事業）">
            <input
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              placeholder="未分類"
              className={inputClass}
              maxLength={30}
            />
          </Field>
          {categories.length > 0 && (
            <div className="-mt-2 flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDraft({ ...draft, category: draft.category === c ? '' : c })}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-bold transition ${
                    draft.category.trim() === c
                      ? 'border-navy bg-navy text-white'
                      : 'border-navy-100 text-navy-300 hover:border-navy-200 hover:text-navy'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          <ol className="space-y-2">
            {draft.items.map((it, idx) => {
              const core = idx === 0;
              return (
                <li
                  key={idx}
                  className={`rounded-xl border p-3 ${core ? 'border-navy-200 bg-navy-50' : 'ml-5 border-navy-100 bg-canvas'}`}
                >
                  <div className="flex items-center gap-2">
                    {core ? (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-navy px-1.5 py-0.5 text-[10px] font-bold text-white">
                        <Star className="h-3 w-3" />
                        コア
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-bold text-navy-300">
                        <CornerDownRight className="h-3.5 w-3.5" />
                        サブ
                      </span>
                    )}
                    <input
                      value={it.title}
                      onChange={(e) => setItem(idx, { title: e.target.value })}
                      placeholder={core ? '例：〇〇さん BASE-PLUS 対面パーソナル' : '例：リマインドを送る'}
                      className={`${inputClass} py-1.5`}
                      maxLength={200}
                    />
                    {!core && (
                      <button
                        onClick={() => setDraft({ ...draft, items: draft.items.filter((_, i) => i !== idx) })}
                        className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                        aria-label="この行を削除"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-1 text-xs text-slate-500">
                    {core ? (
                      <span className="text-navy-300">日時は登録するときに選びます</span>
                    ) : (
                      <TimingInput value={it.timing} onChange={(timing) => setItem(idx, { timing })} />
                    )}
                    <select
                      value={it.priority}
                      onChange={(e) => setItem(idx, { priority: Number(e.target.value) as Priority })}
                      className={`${inputClass} w-auto py-1 text-xs`}
                      aria-label="優先度"
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p.value} value={p.value}>
                          優先度 {p.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={it.duration_minutes}
                      onChange={(e) => setItem(idx, { duration_minutes: Number(e.target.value) })}
                      className={`${inputClass} w-auto py-1 text-xs`}
                      aria-label="所要時間"
                    >
                      {DURATION_OPTIONS.map((d) => (
                        <option key={d} value={d}>
                          {formatDuration(d)}
                        </option>
                      ))}
                    </select>
                  </div>
                </li>
              );
            })}
          </ol>
          <button
            onClick={() => setDraft({ ...draft, items: [...draft.items, blankItem(true)] })}
            className="ml-5 inline-flex w-[calc(100%-1.25rem)] items-center justify-center gap-1 rounded-xl border border-dashed border-navy-200 py-2 text-sm text-navy hover:bg-navy-50"
          >
            <Plus className="h-4 w-4" />
            サブタスクを追加
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="テンプレート・セット"
      onClose={onClose}
      wide
      footer={
        <>
          <div className="flex-1" />
          <button onClick={() => setDraft({ name: '', category: tab && tab !== UNCATEGORIZED && categories.includes(tab) ? tab : '', items: [blankItem()] })} className={primaryButton}>
            <Plus className="h-4 w-4" />
            新規作成
          </button>
        </>
      }
    >
      {templates.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">まだ登録されていません。</div>
      ) : (
        <div className="space-y-4">
          <CategoryTabs
            categories={categories}
            hasUncategorized={templates.some((t) => !t.category.trim())}
            value={tab}
            onChange={setTab}
          />
          {groupByCategory(filterByCategory(templates, categories, tab)).map(([cat, list]) => (
            <section key={cat || 'none'}>
              {categories.length > 0 && (
                <h3 className="mb-1.5 border-b border-navy-100 pb-1 text-xs font-bold text-navy">
                  {cat || '未分類'}
                  <span className="ml-1.5 font-normal text-slate-400">{list.length}</span>
                </h3>
              )}
        <ul className="space-y-2">
          {list.map((t) => (
            <li key={t.id} className="rounded-xl border border-navy-100 p-3">
              <div className="flex items-center gap-2">
                {t.items.length > 1 ? <Layers className="h-4 w-4 text-navy" /> : <FileText className="h-4 w-4 text-navy" />}
                <span className="flex-1 font-bold text-navy">{t.name}</span>
                <button onClick={() => onApply(t)} className={`${primaryButton} px-3 py-1.5 text-xs`}>
                  登録
                </button>
                <button
                  onClick={() => setDraft({ id: t.id, name: t.name, category: t.category, items: copyItems(t.items) })}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-navy-50 hover:text-navy"
                  aria-label="編集"
                  title="編集"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDraft({ name: `${t.name}（コピー）`, category: t.category, items: copyItems(t.items) })}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-navy-50 hover:text-navy"
                  aria-label="複製"
                  title="複製"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`「${t.name}」を削除しますか？`)) void onDelete(t.id);
                  }}
                  className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
                  aria-label="削除"
                  title="削除"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <ul className="mt-2 space-y-1 pl-6">
                {t.items.map((i, idx) => (
                  <li key={idx} className={`flex items-center gap-1.5 text-xs ${idx === 0 ? 'font-bold text-slate-700' : 'pl-4 text-slate-600'}`}>
                    {idx === 0 ? (
                      <Star className="h-3 w-3 text-navy" />
                    ) : (
                      <CornerDownRight className="h-3 w-3 text-navy-300" />
                    )}
                    <span className={`h-1.5 w-1.5 rounded-full ${priorityMeta(i.priority).stripe}`} />
                    {i.title}
                    {idx > 0 && <span className="font-normal text-slate-400">（{timingLabel(i.timing)}）</span>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}

/** 分類ごとにまとめる（分類は作った順、未分類は最後） */
function groupByCategory(list: TaskTemplate[]): [string, TaskTemplate[]][] {
  const map = new Map<string, TaskTemplate[]>();
  for (const t of list) {
    const c = t.category.trim();
    map.set(c, [...(map.get(c) ?? []), t]);
  }
  return [...map.entries()].sort(([a], [b]) => Number(a === '') - Number(b === ''));
}
