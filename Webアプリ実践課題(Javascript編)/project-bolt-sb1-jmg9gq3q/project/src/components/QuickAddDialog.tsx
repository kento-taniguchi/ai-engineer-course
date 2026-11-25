import { useState } from 'react';
import { FileText, Layers, Loader2, Plus } from 'lucide-react';
import type { NewTodo, Priority, TaskTemplate } from '@/lib/supabase';
import { DURATION_OPTIONS, formatDateTime, formatDuration, fromInputValue, toInputValue } from '@/lib/date';
import { filterByCategory } from '@/lib/category';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { CategoryTabs } from '@/components/CategoryTabs';
import { Field, Modal, PriceInput, PriorityPicker, ghostButton, inputClass, primaryButton } from '@/components/ui';
import { parsePrice } from '@/lib/sales';
import { CategorySelect } from '@/components/CategorySelect';

interface Props {
  /** クリックした日時 */
  at: Date;
  /** slot = 時間の枠を押した（その時刻に行う） / due = 旗の欄を押した（その日が期限） */
  kind?: 'slot' | 'due';
  templates: TaskTemplate[];
  categories: string[];
  /** タスクに付けられる分類（テンプレート・タスク・定期タスクで使っているもの全部） */
  allCategories: string[];
  onAdd: (item: NewTodo) => Promise<boolean>;
  /** テンプレート・セットを、この日時を実施日時にして登録する */
  onApplyTemplate: (t: TaskTemplate, at: Date) => void;
  onClose: () => void;
}

/** カレンダーをクリックしたときの「タスクを追加」 */
export function QuickAddDialog({ at, kind = 'slot', templates, categories, allCategories, onAdd, onApplyTemplate, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>(2);
  const [scheduled, setScheduled] = useState(kind === 'slot' ? toInputValue(at.toISOString()) : '');
  const [duration, setDuration] = useState(60);
  // 旗の欄から開いたときは、その日の終わりを期限にしておく
  const [due, setDue] = useState(() => {
    if (kind !== 'due') return '';
    const d = new Date(at);
    d.setHours(23, 59, 0, 0);
    return toInputValue(d.toISOString());
  });
  const [saving, setSaving] = useState(false);
  const [price, setPrice] = useState('');
  const [category, setCategory] = useLocalStorage<string>('todo.quickAddCategory', '');
  const [taskCategory, setTaskCategory] = useLocalStorage<string>('todo.addCategory', '');

  const start = fromInputValue(scheduled);
  const visible = filterByCategory(templates, categories, category);

  const save = async () => {
    const t = title.trim();
    if (!t || saving) return;
    setSaving(true);
    const ok = await onAdd({ title: t, priority, scheduled_at: start, duration_minutes: duration, due_at: fromInputValue(due), ...(taskCategory.trim() ? { category: taskCategory.trim() } : {}), ...(parsePrice(price) ? { price: parsePrice(price) } : {}) });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title={kind === 'due' ? `ToDoを追加（${at.getMonth() + 1}/${at.getDate()}が期限）` : 'タスクを追加'}
      onClose={onClose}
      footer={
        <>
          <div className="flex-1" />
          <button onClick={onClose} className={ghostButton}>
            キャンセル
          </button>
          <button onClick={() => void save()} disabled={!title.trim() || saving} className={primaryButton}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            追加
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="タスク名">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputClass} autoFocus />
        </Field>

        <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          <Field label="分類">
            <CategorySelect value={taskCategory} categories={allCategories} onChange={setTaskCategory} />
          </Field>
          <Field label="単価（任意）">
            <PriceInput value={price} onChange={setPrice} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <Field label="カレンダーの日時（いつ行うか）">
            <div className="flex gap-2">
              <input type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} className={inputClass} />
              {scheduled && (
                <button type="button" onClick={() => setScheduled('')} className={`${ghostButton} shrink-0`}>
                  なし
                </button>
              )}
            </div>
            {!scheduled && <span className="mt-1 block text-[11px] text-slate-500">空欄なら、期限までにどこかで行うToDoになります。</span>}
          </Field>
          <Field label="所要時間">
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={inputClass}>
              {DURATION_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {formatDuration(d)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <Field label="優先度">
            <PriorityPicker value={priority} onChange={setPriority} />
          </Field>
          <Field label="期限（任意）">
            <div className="flex gap-2">
              <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className={inputClass} />
              {due && (
                <button type="button" onClick={() => setDue('')} className={`${ghostButton} shrink-0`}>
                  なし
                </button>
              )}
            </div>
          </Field>
        </div>
        <button type="submit" className="hidden" />
      </form>

      {templates.length > 0 && start && (
        <div className="mt-5 border-t border-navy-100 pt-4">
          <div className="mb-2 text-xs font-bold text-navy">
            テンプレート・セットから追加
            <span className="ml-1.5 font-normal tabular-nums text-slate-500">{formatDateTime(start)} を実施日時にします</span>
          </div>
          <CategoryTabs
            categories={categories}
            hasUncategorized={templates.some((t) => !t.category.trim())}
            value={category}
            onChange={setCategory}
            size="sm"
          />
          <div className="mt-2 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {visible.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onApplyTemplate(t, new Date(start));
                  onClose();
                }}
                title={t.items.map((i) => i.title).join(' / ')}
                className="inline-flex items-center gap-1 rounded-full border border-navy-100 bg-white px-2.5 py-1 text-xs text-navy transition hover:border-accent hover:bg-accent-50"
              >
                {t.items.length > 1 ? <Layers className="h-3.5 w-3.5" aria-hidden /> : <FileText className="h-3.5 w-3.5" aria-hidden />}
                {t.name}
                {t.items.length > 1 && <span className="text-[10px] text-slate-500">×{t.items.length}</span>}
              </button>
            ))}
            {visible.length === 0 && <span className="text-xs text-slate-500">この分類にはまだありません。</span>}
          </div>
        </div>
      )}
    </Modal>
  );
}
