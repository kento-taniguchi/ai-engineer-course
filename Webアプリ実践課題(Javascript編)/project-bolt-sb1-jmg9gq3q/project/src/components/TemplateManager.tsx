import { useRef, useState } from 'react';
import { ArrowLeft, Copy, UserRound, CornerDownRight, FileText, Layers, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import type { ItemTiming, Priority, TaskTemplate, TemplateItem } from '@/lib/supabase';
import { DURATION_OPTIONS, formatDuration } from '@/lib/date';
import { DAY_OFFSETS, PRIORITIES, dayLabel, priorityMeta, timingLabel } from '@/lib/tasks';
import { Field, Modal, ghostButton, inputClass, primaryButton } from '@/components/ui';
import { parsePrice, priceText, yen } from '@/lib/sales';
import { CategoryTabs } from '@/components/CategoryTabs';
import { CategorySelect } from '@/components/CategorySelect';
import { CUSTOMER_TOKEN } from '@/lib/customer';
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
  // 「{お客さん}を入れる」で、最後に入力していた欄のカーソル位置に差し込む
  const nameRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLInputElement | null)[]>([]);
  const lastFocus = useRef<{ kind: 'name' } | { kind: 'item'; idx: number }>({ kind: 'item', idx: 0 });

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

  const insertToken = () => {
    if (!draft) return;
    const f = lastFocus.current;
    const el = f.kind === 'name' ? nameRef.current : itemRefs.current[f.idx];
    const cur = f.kind === 'name' ? draft.name : (draft.items[f.idx]?.title ?? '');
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? start;
    const next = cur.slice(0, start) + CUSTOMER_TOKEN + cur.slice(end);
    if (f.kind === 'name') setDraft({ ...draft, name: next });
    else setItem(f.idx, { title: next });
    requestAnimationFrame(() => {
      const pos = start + CUSTOMER_TOKEN.length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

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
          <Field label="名前">
            <input
              value={draft.name}
              ref={nameRef}
              onFocus={() => (lastFocus.current = { kind: 'name' })}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className={inputClass}
              maxLength={60}
              autoFocus
            />
          </Field>

          <Field label="分類">
            <CategorySelect
              value={draft.category}
              categories={categories}
              onChange={(category) => setDraft({ ...draft, category })}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-navy-200 px-3 py-2 text-xs text-slate-600">
            <button type="button" onClick={insertToken} className={`${ghostButton} py-1 text-xs`}>
              <UserRound className="h-3.5 w-3.5" aria-hidden />
              {CUSTOMER_TOKEN} を入れる
            </button>
            <span className="min-w-0 flex-1">
              最後に入力していた欄に入ります。登録するときにお客さんの名前を入れると、その名前に置き換わります。
            </span>
          </div>

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
                      <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-bold text-navy-400">
                        <CornerDownRight className="h-3.5 w-3.5" />
                        サブ
                      </span>
                    )}
                    <input
                      ref={(el) => {
                        itemRefs.current[idx] = el;
                      }}
                      onFocus={() => (lastFocus.current = { kind: 'item', idx })}
                      value={it.title}
                      onChange={(e) => setItem(idx, { title: e.target.value })}
                      placeholder={core ? 'コアのタスク名' : 'サブタスク名'}
                      className={`${inputClass} py-1.5`}
                      maxLength={200}
                    />
                    {!core && (
                      <button
                        onClick={() => setDraft({ ...draft, items: draft.items.filter((_, i) => i !== idx) })}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-500"
                        aria-label="この行を削除"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-1 text-xs text-slate-500">
                    {core ? (
                      <>
                        <span className="text-navy-400">日時は登録するときに選びます</span>
                        <span className="relative">
                          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-navy-400" aria-hidden>
                            ¥
                          </span>
                          <input
                            value={priceText(it.price)}
                            onChange={(e) => setItem(idx, { price: parsePrice(e.target.value) })}
                            inputMode="numeric"
                            maxLength={10}
                            placeholder="単価"
                            aria-label="単価（円）"
                            className={`${inputClass} w-28 py-1 pl-5 text-xs tabular-nums`}
                          />
                        </span>
                      </>
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
        <div className="py-10 text-center text-sm text-slate-500">まだ登録されていません。</div>
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
                  <span className="ml-1.5 font-normal text-slate-500">{list.length}</span>
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
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-navy-50 hover:text-navy"
                  aria-label="編集"
                  title="編集"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDraft({ name: `${t.name}（コピー）`, category: t.category, items: copyItems(t.items) })}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-navy-50 hover:text-navy"
                  aria-label="複製"
                  title="複製"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`「${t.name}」を削除しますか？`)) void onDelete(t.id);
                  }}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-500"
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
                      <CornerDownRight className="h-3 w-3 text-navy-400" />
                    )}
                    <span className={`h-1.5 w-1.5 rounded-full ${priorityMeta(i.priority).stripe}`} />
                    {i.title}
                    {idx > 0 && <span className="font-normal text-slate-500">（{timingLabel(i.timing)}）</span>}
                    {!!i.price && <span className="rounded bg-emerald-50 px-1 font-bold tabular-nums text-emerald-700">{yen(i.price)}</span>}
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
