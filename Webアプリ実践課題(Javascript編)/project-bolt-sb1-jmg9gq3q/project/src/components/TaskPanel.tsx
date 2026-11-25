import { useMemo, useState } from 'react';
import { AlertCircle, ChevronRight, ChevronsDownUp, ChevronsUpDown, FileText, LayoutList, Layers, List, Loader2, Repeat, Settings2, UserRound } from 'lucide-react';
import type { TaskTemplate, Todo } from '@/lib/supabase';
import { isOverdue } from '@/lib/tasks';
import { BUCKETS, DEFAULT_CLOSED, bucketOf, buildGroups, sortGroups, type BucketKey, type ListFilter } from '@/lib/groups';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { TaskItem } from '@/components/TaskItem';
import { CategoryTabs } from '@/components/CategoryTabs';
import { filterByCategory } from '@/lib/category';
import type { CategoryColor } from '@/lib/colors';

interface Props {
  todos: Todo[];
  loading: boolean;
  now: Date;
  templates: TaskTemplate[];
  categories: string[];
  colorOf: (category: string) => CategoryColor;
  pickedId: string | null;
  onApplyTemplate: (t: TaskTemplate) => void;
  onManageTemplates: () => void;
  recurringCount: number;
  onManageRecurring: () => void;
  onOpenAccount: () => void;
  onToggle: (t: Todo) => void;
  onEdit: (id: string) => void;
  onPick: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TaskPanel(props: Props) {
  const { todos, loading, now, templates, categories, pickedId } = props;
  const [filter, setFilter] = useState<ListFilter>('active');

  // 開け閉めの状態はブラウザに覚えておく
  // 閉じているまとまりを覚える（新しく増えたまとまりは開いた状態で出る）
  const [closedBuckets, setClosedBuckets] = useLocalStorage<BucketKey[]>('todo.closedBuckets', DEFAULT_CLOSED);
  // 表示の大きさ：compact = 1行で多く見る / detail = 期限などを2行で詳しく
  const [density, setDensity] = useLocalStorage<'compact' | 'detail'>('todo.density', 'compact');
  const compact = density === 'compact';
  const [expanded, setExpanded] = useLocalStorage<string[]>('todo.expandedGroups', []);
  const [templatesOpen, setTemplatesOpen] = useLocalStorage('todo.templatesOpen', true);
  const [category, setCategory] = useLocalStorage<string>('todo.templateCategory', '');

  const sections = useMemo(() => {
    const groups = sortGroups(buildGroups(todos, filter));
    const map = new Map<BucketKey, typeof groups>();
    for (const g of groups) {
      const key = filter === 'done' ? 'past' : bucketOf(g, now);
      // 完了タブは日付で分けず1つにまとめる
      map.set(key, [...(map.get(key) ?? []), g]);
    }
    return BUCKETS.filter((b) => map.has(b.key)).map((b) => ({ ...b, groups: map.get(b.key)! }));
  }, [todos, filter, now]);

  const titles = useMemo(() => new Map(todos.map((t) => [t.id, t.title])), [todos]);
  const activeCount = todos.filter((t) => !t.completed).length;
  const overdueCount = todos.filter((t) => isOverdue(t, now)).length;

  const visibleTemplates = filterByCategory(templates, categories, category);

  const toggleBucket = (key: BucketKey) =>
    setClosedBuckets((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  const toggleGroup = (id: string) => setExpanded((cur) => (cur.includes(id) ? cur.filter((k) => k !== id) : [...cur, id]));
  const allOpen = sections.length > 0 && sections.every((s) => !closedBuckets.includes(s.key));


  const renderItem = (t: Todo, extra: Partial<React.ComponentProps<typeof TaskItem>> = {}) => (
    <TaskItem
      key={t.id}
      todo={t}
      now={now}
      picked={pickedId === t.id}
      categoryColor={t.category ? props.colorOf(t.category) : null}
      parentTitle={t.parent_id ? titles.get(t.parent_id) ?? null : null}
      onToggle={() => props.onToggle(t)}
      onEdit={() => props.onEdit(t.id)}
      onPick={() => props.onPick(t.id)}
      onDelete={() => props.onDelete(t.id)}
      compact={compact}
      {...extra}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">

      {/* テンプレート・セット（分類タブ付き・折りたたみ可） */}
      <div className="border-b border-navy-100 px-3 py-2">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setTemplatesOpen(!templatesOpen)}
            aria-expanded={templatesOpen}
            className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-bold text-navy hover:bg-navy-50"
          >
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${templatesOpen ? 'rotate-90' : ''}`} />
            テンプレート・セット
            <span className="font-normal text-slate-500">{templates.length}</span>
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={props.onManageRecurring}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-navy-400 hover:bg-navy-50 hover:text-navy"
            >
              <Repeat className="h-3.5 w-3.5" />
              定期
              {props.recurringCount > 0 && <span className="text-slate-500">{props.recurringCount}</span>}
            </button>
            <button
              onClick={props.onManageTemplates}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-navy-400 hover:bg-navy-50 hover:text-navy"
            >
              <Settings2 className="h-3.5 w-3.5" />
              管理
            </button>
            <button
              onClick={props.onOpenAccount}
              className="rounded-md p-1 text-navy-400 hover:bg-navy-50 hover:text-navy"
              aria-label="アカウント（ログアウト）"
              title="アカウント（ログアウト）"
            >
              <UserRound className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {templatesOpen && (
          <div className="mt-2">
            {templates.length === 0 ? (
              <button
                onClick={props.onManageTemplates}
                className="w-full rounded-lg border border-dashed border-navy-200 py-2 text-xs text-navy-400 hover:bg-navy-50"
              >
                よく使うタスクを登録する
              </button>
            ) : (
              <>
                <CategoryTabs
                  categories={categories}
                  hasUncategorized={templates.some((t) => !t.category.trim())}
                  value={category}
                  onChange={setCategory}
                  size="sm"
                />
                <div className="mt-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                  {visibleTemplates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => props.onApplyTemplate(t)}
                      title={t.items.map((i) => i.title).join(' / ')}
                      className="inline-flex items-center gap-1 rounded-full border border-navy-100 bg-white px-2.5 py-1 text-xs text-navy transition hover:border-accent hover:bg-accent-50"
                    >
                      {t.items.length > 1 ? <Layers className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                      {t.name}
                      {t.items.length > 1 && <span className="text-[10px] text-slate-500">×{t.items.length}</span>}
                    </button>
                  ))}
                  {visibleTemplates.length === 0 && <span className="text-xs text-slate-500">この分類にはまだありません。</span>}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 絞り込み */}
      <div className="flex items-center gap-1.5 px-3 pt-2">
        <div className="flex flex-1 gap-1 rounded-lg bg-navy-50 p-0.5">
          {(
            [
              ['active', '未完了'],
              ['done', '完了'],
              ['all', 'すべて'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-bold transition ${
                filter === value ? 'bg-white text-navy shadow-sm' : 'text-navy-400 hover:text-navy'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <span>{activeCount}件</span>
          {overdueCount > 0 && (
            <span
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 font-bold text-white"
              aria-label={`期限切れ ${overdueCount}件`}
            >
              {overdueCount}
            </span>
          )}
        </div>
        <button
          onClick={() => setDensity(compact ? 'detail' : 'compact')}
          className="rounded-md p-1 text-navy-400 hover:bg-navy-50 hover:text-navy"
          title={compact ? '詳しく表示する' : '1行で多く表示する'}
          aria-label={compact ? '詳しく表示する' : '1行で多く表示する'}
        >
          {compact ? <LayoutList className="h-4 w-4" /> : <List className="h-4 w-4" />}
        </button>
        {sections.length > 1 && (
          <button
            onClick={() => setClosedBuckets(allOpen ? sections.map((s) => s.key) : [])}
            className="rounded-md p-1 text-navy-400 hover:bg-navy-50 hover:text-navy"
            title={allOpen ? 'すべて折りたたむ' : 'すべて開く'}
            aria-label={allOpen ? 'すべて折りたたむ' : 'すべて開く'}
          >
            {allOpen ? <ChevronsDownUp className="h-4 w-4" /> : <ChevronsUpDown className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* 一覧（日付ごとに折りたたみ） */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-1.5">
        {loading ? (
          <div className="flex justify-center py-12 text-navy-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : sections.length === 0 ? (
          <div className="mt-2 rounded-xl border border-dashed border-navy-200 py-12 text-center text-sm text-slate-500">
            {filter === 'done' ? '完了したタスクはありません。' : 'タスクはありません。'}
          </div>
        ) : (
          <div className="space-y-1.5">
            {sections.map((s) => {
              const open = filter === 'done' || !closedBuckets.includes(s.key);
              const count = s.groups.reduce((n, g) => n + 1 + g.children.length, 0);
              const overdue = s.key === 'overdue';
              return (
                <section key={s.key}>
                  {filter !== 'done' && (
                    <button
                      onClick={() => toggleBucket(s.key)}
                      aria-expanded={open}
                      aria-label={overdue ? '期限切れ' : s.label}
                      className={`sticky top-0 z-10 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold ${
                        overdue ? 'bg-red-600 text-white' : 'bg-white/95 text-navy backdrop-blur hover:bg-navy-50'
                      }`}
                    >
                      <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
                      {overdue ? <AlertCircle className="h-3.5 w-3.5" /> : s.label}
                      <span className={`ml-auto rounded-full px-1.5 text-[11px] ${overdue ? 'bg-white/25' : 'bg-navy-50 text-navy-400'}`}>
                        {count}
                      </span>
                    </button>
                  )}
                  {open && (
                    <ul className={`mt-1 ${compact ? 'space-y-1' : 'space-y-2'}`}>
                      {s.groups.map((g) => {
                        const isOpen = expanded.includes(g.root.id);
                        return (
                          <li key={g.root.id}>
                            <ul className={compact ? 'space-y-1' : 'space-y-1.5'}>
                              {renderItem(
                                g.root,
                                g.children.length
                                  ? {
                                      subtasks: {
                                        total: g.children.length,
                                        done: g.children.filter((c) => c.completed).length,
                                        overdue: g.children.some((c) => isOverdue(c, now)),
                                      },
                                      expanded: isOpen,
                                      onToggleExpand: () => toggleGroup(g.root.id),
                                    }
                                  : {},
                              )}
                              {isOpen && (
                                <li>
                                  <ul className={`ml-4 border-l-2 border-navy-100 pl-1.5 ${compact ? 'space-y-1' : 'space-y-1.5'}`}>
                                    {g.children.map((c) => renderItem(c, { nested: true }))}
                                  </ul>
                                </li>
                              )}
                            </ul>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
