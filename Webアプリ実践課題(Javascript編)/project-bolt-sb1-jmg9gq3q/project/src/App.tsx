import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarDays, ListTodo, X } from 'lucide-react';
import { GoogleLogo } from '@/components/ui';
import type { TaskTemplate, TodoPatch } from '@/lib/supabase';
import { dayKey, formatDateTime } from '@/lib/date';
import { hasCustomerToken, pastCustomers } from '@/lib/customer';
import { useCategoryColors } from '@/hooks/useCategories';
import { buildFromTemplate, computeTiming, isSet } from '@/lib/tasks';
import { ApplyTemplateDialog } from '@/components/ApplyTemplateDialog';
import { useTodos } from '@/hooks/useTodos';
import { useTemplates } from '@/hooks/useTemplates';
import { useRecurring } from '@/hooks/useRecurring';
import { RecurringManager } from '@/components/RecurringManager';
import { QuickAddDialog } from '@/components/QuickAddDialog';
import { PANEL_DEFAULT, PanelDivider } from '@/components/PanelDivider';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useNow } from '@/hooks/useNow';
import { TaskPanel } from '@/components/TaskPanel';
import { TaskEditor } from '@/components/TaskEditor';
import { TemplateManager } from '@/components/TemplateManager';
import { CalendarView, type CalendarMode } from '@/components/calendar/CalendarView';
import { SalesDialog, SalesStrip } from '@/components/Sales';
import type { PeriodKind } from '@/lib/sales';
import type { Session } from '@supabase/supabase-js';
import { AccountDialog } from '@/components/AccountDialog';
import { GoogleCalendarDialog } from '@/components/GoogleCalendarDialog';
import { takeJustConnected } from '@/lib/googleCalendar';
import { takeLaunchIntent } from '@/lib/launch';
import { NARROW, PHONE, useMediaQuery } from '@/hooks/useMediaQuery';
import { isOverdue } from '@/lib/tasks';

function App({ session }: { session: Session }) {
  const { todos, loading, error: todoError, addTodos, addTaskSet, updateTodo, deleteTodo, mergeTodos, dropTodos, clearError, undo, undoGroup } =
    useTodos();
  const tpl = useTemplates();
  const rec = useRecurring();
  const cat = useCategoryColors();
  const now = useNow();

  // LINE のリンクから開いたときは、その画面（今日のカレンダー・売上）から始める
  const [launch] = useState(takeLaunchIntent);
  // スマホ・タブレットの幅では、一覧とカレンダーを下のボタンで切り替える
  const narrow = useMediaQuery(NARROW);
  const [tab, setTab] = useState<'list' | 'calendar'>(launch === 'today' ? 'calendar' : 'list');

  // スマホは週だと狭いので、日の表示から始める
  const [mode, setMode] = useState<CalendarMode>(() => (window.matchMedia(PHONE).matches ? 'day' : 'week'));
  const [cursor, setCursor] = useState(() => new Date());
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [quickAdd, setQuickAdd] = useState<{ at: Date; kind: 'slot' | 'due' } | null>(null);
  const [panelWidth, setPanelWidth] = useLocalStorage('todo.panelWidth', PANEL_DEFAULT);
  const [applying, setApplying] = useState<{ template: TaskTemplate; at: Date | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [salesKind, setSalesKind] = useState<PeriodKind | null>(() =>
    launch === 'sales-day' ? 'day' : launch === 'sales-week' ? 'week' : launch === 'sales-month' ? 'month' : null,
  );
  const [showAccount, setShowAccount] = useState(false);
  // Google の許可画面から戻ってきたときは、取り込みの画面を開いたままにする
  const [showGcal, setShowGcal] = useState(takeJustConnected);

  const editing = todos.find((t) => t.id === editingId) ?? null;
  const error = todoError ?? tpl.error ?? rec.error ?? cat.error;

  // 分類の一覧：色を決めた順 → テンプレート → タスク → 定期タスクで使っているもの
  const allCategories = useMemo(() => {
    const names = [
      ...cat.names,
      ...tpl.categories,
      ...todos.map((t) => t.category ?? ''),
      ...rec.tasks.map((r) => r.category ?? ''),
    ].map((n) => n.trim());
    return [...new Set(names.filter(Boolean))];
  }, [cat.names, tpl.categories, todos, rec.tasks]);

  // 新しく使われた分類に、空いている色を割り当てる
  const { ready: catReady, ensure: ensureColors } = cat;
  useEffect(() => {
    if (catReady) void ensureColors(allCategories);
  }, [catReady, allCategories, ensureColors]);
  const todayKey = dayKey(now);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  // 定期タスク：まだ作っていない日の分（今日から7日先まで）を作る。日付が変わったときも作る
  const { ready: recReady, tasks: recTasks, generate } = rec;
  useEffect(() => {
    if (loading || !recReady) return;
    void generate(new Date()).then(mergeTodos);
  }, [loading, recReady, recTasks, todayKey, generate, mergeTodos]);

  useEffect(() => {
    if (!pickedId) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPickedId(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickedId]);

  // Ctrl+Z（Mac は ⌘+Z）：タスクの追加・変更・移動・削除を1つずつ元に戻す。
  // 文字を入力している欄の中では、ふつうの「入力の取り消し」にまかせる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.code !== 'KeyZ' || e.isComposing) return;
      const el = e.target as HTMLElement | null;
      if (el?.isContentEditable || el instanceof HTMLTextAreaElement) return;
      if (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'range', 'color'].includes(el.type)) return;
      e.preventDefault();
      setPickedId(null);
      void undo().then((label) => setToast(label ? `元に戻しました（${label}）` : '元に戻せる操作はありません'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  /** base はコアタスクの実施日時（null ならカレンダーに入れない）。customer は {お客さん} に入る名前 */
  const applyTemplate = async (t: TaskTemplate, base: Date | null, customer = '') => {
    const { core, subs } = buildFromTemplate(t, base, customer);
    const ok = await addTaskSet(core, subs);
    if (ok) setToast(`「${core.set_name ?? core.title}」を${t.items.length}件登録しました`);
  };

  /**
   * セット・お客さんの名前が入るテンプレートは、登録画面で日時と名前を決めてから登録する。
   * それ以外の1件だけのテンプレートは、すぐ登録（カレンダーから開いたときはその日時で）。
   */
  const requestApply = (t: TaskTemplate, at: Date | null = null) => {
    if (isSet(t) || hasCustomerToken(t)) setApplying({ template: t, at });
    else void applyTemplate(t, at);
  };

  /** コアタスクの実施日時が変わったら、未完了のサブタスクも新しい日時に合わせて動かす */
  const moveSubtasks = (coreId: string, base: Date) => {
    const children = todos.filter((c) => c.parent_id === coreId && !c.completed);
    let moved = 0;
    for (const c of children) {
      const at = computeTiming(c.timing, base);
      if (!at) continue;
      void updateTodo(c.id, { scheduled_at: at.toISOString(), due_at: at.toISOString() });
      moved++;
    }
    return moved;
  };

  const placeTodo = (id: string, at: Date) => {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;
    const hasChildren = todos.some((c) => c.parent_id === id);
    const patch: TodoPatch = { scheduled_at: at.toISOString() };
    // コアは終了時刻、サブタスクはその時刻を期限として一緒に動かす
    if (hasChildren) patch.due_at = new Date(at.getTime() + todo.duration_minutes * 60_000).toISOString();
    else if (todo.parent_id || todo.timing) patch.due_at = at.toISOString();
    void updateTodo(id, patch);
    const moved = hasChildren ? moveSubtasks(id, at) : 0;
    setPickedId(null);
    setToast(`${formatDateTime(at.toISOString())} に配置しました${moved ? `（サブタスク${moved}件も移動）` : ''}`);
  };

  const removeTodo = (id: string) => {
    if (pickedId === id) setPickedId(null);
    if (editingId === id) setEditingId(null);
    void deleteTodo(id);
  };

  const togglePick = (id: string) => {
    // スマホでは、一覧で選んだらカレンダーに切り替えて、置く日時を押せるようにする
    if (narrow && pickedId !== id) setTab('calendar');
    setPickedId((cur) => (cur === id ? null : id));
  };
  const closeEditor = useCallback(() => setEditingId(null), []);
  const closeTemplates = useCallback(() => setShowTemplates(false), []);
  const closeApplying = useCallback(() => setApplying(null), []);
  const closeRecurring = useCallback(() => setShowRecurring(false), []);
  const closeQuickAdd = useCallback(() => setQuickAdd(null), []);
  const closeSales = useCallback(() => setSalesKind(null), []);
  const closeAccount = useCallback(() => setShowAccount(false), []);
  const closeGcal = useCallback(() => setShowGcal(false), []);
  const overdueCount = todos.filter((t) => isOverdue(t, now)).length;

  return (
    <div className="flex h-dvh flex-col">
      {error && (
        <div className="fixed inset-x-0 top-2 z-40 flex justify-center px-3" role="alert">
          <div className="flex w-full max-w-2xl items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 shadow-lg">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              onClick={() => {
                clearError();
                tpl.clearError();
                rec.clearError();
                cat.clearError();
              }}
              className="rounded p-1 hover:bg-red-100"
              aria-label="閉じる"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <main
        className="grid min-h-0 w-full flex-1 grid-rows-[minmax(0,1fr)] gap-2 p-1.5 sm:p-2 lg:grid-cols-[var(--panel-w)_10px_minmax(0,1fr)] lg:gap-0"
        style={{ '--panel-w': `${panelWidth}px` } as React.CSSProperties}
      >
        <section
          className={`${tab === 'list' ? 'flex' : 'hidden'} min-h-0 flex-col overflow-hidden rounded-xl border border-navy-100 bg-white lg:flex`}
        >
          <SalesStrip todos={todos} now={now} onOpen={setSalesKind} />
          <TaskPanel
            todos={todos}
            loading={loading}
            now={now}
            templates={tpl.templates}
            categories={tpl.categories}
            colorOf={cat.colorOf}
            pickedId={pickedId}
            onApplyTemplate={requestApply}
            onManageTemplates={() => setShowTemplates(true)}
            recurringCount={rec.tasks.length}
            onManageRecurring={() => setShowRecurring(true)}
            onOpenAccount={() => setShowAccount(true)}
            onImportGoogle={() => setShowGcal(true)}
            onToggle={(t) => void updateTodo(t.id, { completed: !t.completed })}
            onEdit={setEditingId}
            onPick={togglePick}
            onDelete={removeTodo}
          />
        </section>

        <PanelDivider width={panelWidth} onChange={setPanelWidth} />

        <section
          className={`${tab === 'calendar' ? 'flex' : 'hidden'} min-h-0 flex-col overflow-hidden rounded-xl border border-navy-100 bg-white lg:flex`}
        >
          <div className="min-h-0 flex-1">
            <CalendarView
              mode={mode}
              onModeChange={setMode}
              cursor={cursor}
              onCursorChange={setCursor}
              todos={todos}
              now={now}
              pickedId={pickedId}
              onPick={togglePick}
              onOpen={setEditingId}
              onPlace={placeTodo}
              onCreateAt={(at) => setQuickAdd({ at, kind: 'slot' })}
              onCreateDue={(day) => setQuickAdd({ at: day, kind: 'due' })}
              categories={allCategories}
              colorOf={cat.colorOf}
              onSetColor={(name, key) => void cat.setColor(name, key)}
            />
          </div>
        </section>
      </main>

      {/* スマホ・タブレット：一覧とカレンダーの切り替え */}
      <nav
        className="grid shrink-0 grid-cols-3 border-t border-navy-100 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="画面の切り替え"
      >
        {(
          [
            ['list', '一覧', ListTodo],
            ['calendar', 'カレンダー', CalendarDays],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            aria-current={tab === value ? 'page' : undefined}
            className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold transition ${
              tab === value ? 'text-navy' : 'text-slate-400'
            }`}
          >
            {tab === value && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-accent" aria-hidden />}
            <Icon className="h-5 w-5" aria-hidden />
            {label}
            {value === 'list' && overdueCount > 0 && (
              <span className="absolute right-[calc(50%-1.6rem)] top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] text-white">
                {overdueCount}
              </span>
            )}
          </button>
        ))}
        <button
          onClick={() => setShowGcal(true)}
          className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold text-slate-400 transition hover:text-navy"
        >
          <GoogleLogo className="h-5 w-5" />
          Google取込
        </button>
      </nav>

      {editing && (
        <TaskEditor
          key={editing.id}
          todo={editing}
          categories={allCategories}
          onClose={closeEditor}
          onDelete={() => removeTodo(editing.id)}
          onSave={(patch) => {
            void updateTodo(editing.id, patch);
            // コアの実施日時を変えたら、サブタスクも合わせて動かす
            let moved = 0;
            if (patch.scheduled_at && patch.scheduled_at !== editing.scheduled_at) {
              moved = moveSubtasks(editing.id, new Date(patch.scheduled_at));
            }
            if (moved) setToast(`サブタスク${moved}件も移動しました`);
            setEditingId(null);
          }}
          onSaveAsTemplate={async () => {
            const ok = await tpl.createTemplate(editing.title, editing.category ?? '', [
              {
                title: editing.title,
                priority: editing.priority,
                duration_minutes: editing.duration_minutes,
                timing: { kind: 'none' },
                ...(editing.price ? { price: editing.price } : {}),
              },
            ]);
            if (ok) setToast(`「${editing.title}」をテンプレートに保存しました`);
          }}
        />
      )}

      {showTemplates && (
        <TemplateManager
          templates={tpl.templates}
          categories={tpl.categories}
          onCreate={tpl.createTemplate}
          onUpdate={tpl.updateTemplate}
          onDelete={tpl.deleteTemplate}
          onApply={(t) => {
            setShowTemplates(false);
            requestApply(t);
          }}
          onClose={closeTemplates}
        />
      )}

      {showRecurring && (
        <RecurringManager
          tasks={rec.tasks}
          now={now}
          categories={allCategories}
          colorOf={cat.colorOf}
          onCreate={async (d) => {
            const ok = await rec.create(d);
            if (ok) setToast(`「${d.title}」を定期タスクに登録しました`);
            return ok;
          }}
          onUpdate={async (id, d) => {
            const removed = await rec.update(id, d);
            if (removed) dropTodos(removed);
            return !!removed;
          }}
          onSetActive={(id, active) =>
            void rec.setActive(id, active).then((removed) => {
              if (removed) {
                dropTodos(removed);
                setToast(active ? '再開しました' : '一時停止しました（今日以降の分を外しました）');
              }
            })
          }
          onDelete={(id) =>
            void rec.remove(id).then((removed) => {
              if (removed) dropTodos(removed);
            })
          }
          onClose={closeRecurring}
        />
      )}

      {quickAdd && (
        <QuickAddDialog
          key={`${quickAdd.kind}-${quickAdd.at.getTime()}`}
          at={quickAdd.at}
          kind={quickAdd.kind}
          templates={tpl.templates}
          categories={tpl.categories}
          allCategories={allCategories}
          onAdd={async (item) => {
            const ok = await addTodos([item]);
            if (ok) setToast(`「${item.title}」を追加しました`);
            return ok;
          }}
          onApplyTemplate={(t, at) => requestApply(t, at)}
          onClose={closeQuickAdd}
        />
      )}

      {applying && (
        <ApplyTemplateDialog
          key={applying.template.id}
          template={applying.template}
          now={now}
          initialAt={applying.at}
          pastNames={hasCustomerToken(applying.template) ? pastCustomers(applying.template, todos) : []}
          onApply={(base, customer) => {
            void applyTemplate(applying.template, base, customer);
            setApplying(null);
          }}
          onClose={closeApplying}
        />
      )}

      {showAccount && <AccountDialog session={session} onClose={closeAccount} />}

      {showGcal && (
        <GoogleCalendarDialog
          todos={todos}
          categories={allCategories}
          templates={tpl.templates}
          onAdd={addTodos}
          onAddSet={addTaskSet}
          onUpdate={updateTodo}
          onDelete={deleteTodo}
          group={undoGroup}
          onDone={setToast}
          onClose={closeGcal}
        />
      )}

      {salesKind && (
        <SalesDialog
          todos={todos}
          now={now}
          initialKind={salesKind}
          colorOf={cat.colorOf}
          onOpenTask={(id) => {
            setSalesKind(null);
            setEditingId(id);
          }}
          onClose={closeSales}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-[60] w-max max-w-[90vw] -translate-x-1/2 rounded-full bg-navy px-4 py-2 text-center text-sm text-white shadow-lg lg:bottom-5">
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
