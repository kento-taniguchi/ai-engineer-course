import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import type { NewTodo, TaskTemplate, Todo, TodoPatch } from '@/lib/supabase';
import { buildFromTemplate, computeTiming, isSet } from '@/lib/tasks';
import { addDays, startOfDay } from '@/lib/date';
import {
  CalendarAuthError,
  defaultKeyword,
  eventToTodo,
  matchSet,
  forgetCalendarToken,
  getCalendarToken,
  importedDate,
  listCalendars,
  listEvents,
  requestCalendarAccess,
  type GoogleCalendar,
  type SetMatch,
  type SetRule,
} from '@/lib/googleCalendar';
import { authErrorText } from '@/lib/auth';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { CategorySelect } from '@/components/CategorySelect';
import { Field, GoogleLogo, Modal, ghostButton, inputClass, primaryButton } from '@/components/ui';

const RANGES = [
  { weeks: 1, label: '1週間先まで' },
  { weeks: 2, label: '2週間先まで' },
  { weeks: 4, label: '4週間先まで' },
  { weeks: 8, label: '8週間先まで' },
  { weeks: 13, label: '3か月先まで' },
];

interface Props {
  todos: Todo[];
  categories: string[];
  templates: TaskTemplate[];
  onAdd: (items: NewTodo[]) => Promise<boolean>;
  /** コア＋サブタスクのセットを登録する */
  onAddSet: (core: NewTodo, subs: NewTodo[]) => Promise<boolean>;
  onUpdate: (id: string, patch: TodoPatch) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  /** 取り込みで起きた追加・変更・削除を、1回の Ctrl+Z で戻せるようにまとめる */
  group: <T>(label: string, fn: () => Promise<T>) => Promise<T>;
  onDone: (message: string) => void;
  onClose: () => void;
}

/** Google カレンダーの予定を、アプリのタスクとして取り込む */
export function GoogleCalendarDialog({ todos, categories, templates, onAdd, onAddSet, onUpdate, onDelete, group, onDone, onClose }: Props) {
  const [token, setToken] = useState(getCalendarToken);
  const [calendars, setCalendars] = useState<GoogleCalendar[] | null>(null);
  const [selected, setSelected] = useLocalStorage<string[]>('todo.gcal.calendars', []);
  const [weeks, setWeeks] = useLocalStorage('todo.gcal.weeks', 4);
  const [allDay, setAllDay] = useLocalStorage('todo.gcal.allDay', false);
  const [category, setCategory] = useLocalStorage('todo.gcal.category', '');
  // セットごとの目印の言葉（テンプレートのIDごとに覚える）
  const [savedRules, setSavedRules] = useLocalStorage<Record<string, SetRule>>('todo.gcal.setRules', {});
  const setTemplates = templates.filter(isSet);
  const ruleOf = (t: TaskTemplate): SetRule => savedRules[t.id] ?? { keyword: defaultKeyword(t), enabled: true };
  const changeRule = (t: TaskTemplate, patch: Partial<SetRule>) => setSavedRules((cur) => ({ ...cur, [t.id]: { ...ruleOf(t), ...patch } }));
  const [busy, setBusy] = useState<'connect' | 'sync' | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const fail = (e: unknown) => {
    if (e instanceof CalendarAuthError) setToken(null);
    setError(e instanceof Error ? e.message : String(e));
  };

  // 許可があれば、カレンダーの一覧を読む。何も選んでいなければ、自分のメインのカレンダーを選ぶ
  useEffect(() => {
    if (!token) return;
    let active = true;
    listCalendars(token)
      .then((list) => {
        if (!active) return;
        setCalendars(list);
        setSelected((cur) => {
          const kept = cur.filter((id) => list.some((c) => c.id === id));
          return kept.length ? kept : list.filter((c) => c.primary).map((c) => c.id);
        });
      })
      .catch((e: unknown) => active && fail(e));
    return () => {
      active = false;
    };
  }, [token, setSelected]);

  const connect = async () => {
    setError('');
    setBusy('connect');
    try {
      await requestCalendarAccess(); // 成功すると Google の画面へ移る
    } catch (e) {
      setError(authErrorText(e instanceof Error ? e.message : String(e)));
      setBusy(null);
    }
  };

  const sync = async () => {
    if (!token || selected.length === 0) return;
    setError('');
    setResult('');
    setBusy('sync');
    try {
      const from = startOfDay(new Date());
      const to = addDays(from, weeks * 7);
      const known = new Map(todos.filter((t) => t.google_event_id).map((t) => [t.google_event_id!, t]));
      const childrenOf = (id: string) => todos.filter((c) => c.parent_id === id);
      const rules = setTemplates.map((template) => ({ template, rule: ruleOf(template) }));
      const inserts: NewTodo[] = [];
      const sets: { core: NewTodo; subs: NewTodo[] }[] = [];
      const updates: { id: string; patch: TodoPatch }[] = [];
      /** すでに1件だけで取り込んだ予定に、あとからサブタスクを付けてセットにする */
      const toSet: { id: string; patch: TodoPatch; subs: NewTodo[] }[] = [];
      // Google にまだある予定（終日を取り込まない設定でも、消えたと間違えないように全部覚える）
      const alive = new Set<string>();

      /** テンプレートのセットを、予定の時刻を基準に作る（時間の長さ・メモ・Googleの印は予定のものを使う） */
      const buildSet = (m: SetMatch, row: NewTodo, base: Date) => {
        const { core, subs } = buildFromTemplate(m.template, base, m.customer);
        const minutes = row.duration_minutes ?? core.duration_minutes ?? 60;
        // テンプレートに分類が無ければ、この画面で選んだ分類を付ける
        const fallback = !m.template.category.trim() && category.trim() ? { category: category.trim() } : {};
        return {
          core: {
            ...core,
            ...fallback,
            notes: row.notes,
            duration_minutes: minutes,
            due_at: new Date(base.getTime() + minutes * 60_000).toISOString(),
            google_event_id: row.google_event_id,
            google_updated: row.google_updated,
          },
          subs: subs.map((sub) => ({ ...sub, ...fallback })),
        };
      };

      for (const calId of selected) {
        for (const ev of await listEvents(token, calId, from, to)) {
          if (ev.status === 'cancelled') continue;
          const row = eventToTodo(ev, calId, category.trim());
          if (!row) continue;
          const key = row.google_event_id!;
          alive.add(key);
          if (!ev.start.dateTime && !allDay) continue;
          // 時刻のある予定だけ、セットにできるか調べる
          const match = ev.start.dateTime ? matchSet(ev.summary ?? '', rules) : null;
          const ex = known.get(key);
          const changed = !!ex && (!ex.google_updated || Date.parse(ex.google_updated) < Date.parse(ev.updated));

          if (!ex) {
            if (match) sets.push(buildSet(match, row, new Date(row.scheduled_at!)));
            else inserts.push(row);
            continue;
          }

          const kids = childrenOf(ex.id);
          if (match && kids.length === 0 && !ex.set_name) {
            // 前に1件だけで取り込んだ予定 → セットにする。Google 側が変わっていなければ、アプリで動かした時刻を基準にする
            const base = new Date((changed ? row.scheduled_at : ex.scheduled_at) ?? row.scheduled_at!);
            const { core, subs } = buildSet(match, row, base);
            toSet.push({
              id: ex.id,
              patch: {
                title: core.title,
                set_name: core.set_name,
                priority: core.priority,
                ...(core.category ? { category: core.category } : {}),
                ...(core.price && !ex.price ? { price: core.price } : {}),
                notes: core.notes,
                scheduled_at: core.scheduled_at,
                due_at: core.due_at,
                duration_minutes: core.duration_minutes,
                google_updated: ev.updated,
              },
              subs: subs.map((sub) => ({ ...sub, parent_id: ex.id })),
            });
            continue;
          }

          // Google 側で変わったときだけ直す（アプリで動かした時刻や分類はそのまま残す）
          if (!changed) continue;
          if (kids.length > 0 || ex.set_name) {
            // セット：名前はテンプレートで作ったものを残し、時刻だけ合わせる。終わっていないサブタスクも一緒に動かす
            const base = new Date(row.scheduled_at ?? row.due_at!);
            const minutes = row.duration_minutes ?? ex.duration_minutes;
            updates.push({
              id: ex.id,
              patch: {
                notes: row.notes,
                scheduled_at: row.scheduled_at,
                due_at: row.scheduled_at ? new Date(base.getTime() + minutes * 60_000).toISOString() : row.due_at,
                duration_minutes: minutes,
                google_updated: ev.updated,
              },
            });
            if (row.scheduled_at) {
              for (const c of kids) {
                if (c.completed) continue;
                const at = computeTiming(c.timing, base);
                if (at) updates.push({ id: c.id, patch: { scheduled_at: at.toISOString(), due_at: at.toISOString() } });
              }
            }
          } else {
            updates.push({
              id: ex.id,
              patch: {
                title: row.title,
                notes: row.notes,
                scheduled_at: row.scheduled_at,
                due_at: row.due_at,
                duration_minutes: row.duration_minutes,
                google_updated: ev.updated,
              },
            });
          }
        }
      }

      // Google から消えた予定：今回読んだカレンダー・期間の、まだ終わっていないものだけ外す（セットなら、終わっていないサブタスクも）
      const removedCores = todos.filter((t) => {
        if (!t.google_event_id || t.completed || alive.has(t.google_event_id)) return false;
        const calId = t.google_event_id.slice(0, t.google_event_id.lastIndexOf(':'));
        const d = importedDate(t);
        return selected.includes(calId) && !!d && d >= from && d < to;
      });
      const removed = [...removedCores, ...removedCores.flatMap((t) => childrenOf(t.id).filter((c) => !c.completed))];

      await group('Googleカレンダーの取り込み', async () => {
        const saveFailed = () => new Error('タスクを保存できませんでした（上に出ている赤いお知らせをご覧ください）。');
        if (inserts.length && !(await onAdd(inserts))) throw saveFailed();
        for (const one of sets) if (!(await onAddSet(one.core, one.subs))) throw saveFailed();
        for (const one of toSet) {
          if (!(await onUpdate(one.id, one.patch))) throw saveFailed();
          if (one.subs.length && !(await onAdd(one.subs))) throw saveFailed();
        }
        await Promise.all(updates.map((u) => onUpdate(u.id, u.patch)));
        await Promise.all(removed.map((t) => onDelete(t.id)));
      });

      const parts = [
        inserts.length && `新しく${inserts.length}件`,
        sets.length && `セット${sets.length}件`,
        toSet.length && `セットに変更${toSet.length}件`,
        updates.length && `変更${updates.length}件`,
        removed.length && `削除${removed.length}件`,
      ].filter(Boolean);
      const msg = parts.length ? `Googleカレンダーから取り込みました（${parts.join('・')}）` : 'Googleカレンダーと同じ内容です（変更なし）';
      setResult(msg);
      onDone(msg);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]));

  return (
    <Modal
      title="Googleカレンダーから取り込む"
      onClose={onClose}
      footer={
        token ? (
          <>
            <button
              onClick={() => {
                forgetCalendarToken();
                setToken(null);
                setCalendars(null);
              }}
              className="text-xs text-navy-400 hover:text-navy hover:underline"
            >
              許可を使うのをやめる
            </button>
            <div className="flex-1" />
            <button onClick={onClose} className={ghostButton}>
              閉じる
            </button>
            <button onClick={() => void sync()} disabled={!!busy || selected.length === 0} className={primaryButton}>
              {busy === 'sync' ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleLogo />}
              取り込む
            </button>
          </>
        ) : undefined
      }
    >
      <div className="space-y-4 text-sm">
        {!token ? (
          <>
            <p className="text-slate-600">
              Google カレンダーの予定を読んで、このアプリのタスクとして入れます。Google 側の予定は変わりません（読むだけです）。
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-600">
              <li>下のボタンを押すと、Google の画面に移ります。</li>
              <li>このアプリにログインしている Google アカウントを選びます。</li>
              <li>「カレンダーの予定を表示」にチェックを入れて「続行」を押すと、この画面に戻ります。</li>
            </ol>
            <p className="rounded-lg bg-canvas px-3 py-2 text-[11px] text-slate-500">
              「Google がこのアプリを確認していません」と出たら、「詳細」→「（アプリ名）に移動」で進めます。自分で作ったアプリなので心配ありません。許可は1時間だけ使え、切れたらもう一度押します。
            </p>
            <button onClick={() => void connect()} disabled={!!busy} className={`${primaryButton} w-full`}>
              {busy === 'connect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleLogo />}
              Google で許可する
            </button>
          </>
        ) : (
          <>
            <section>
              <h3 className="mb-1.5 text-xs font-bold text-navy">取り込むカレンダー</h3>
              {calendars === null ? (
                error ? null : (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    カレンダーを読み込んでいます…
                  </div>
                )
              ) : (
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {calendars.map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-navy-100 px-3 py-2 hover:bg-navy-50">
                        <input
                          type="checkbox"
                          checked={selected.includes(c.id)}
                          onChange={() => toggle(c.id)}
                          className="h-4 w-4 accent-navy"
                        />
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: c.backgroundColor ?? '#1E3A8A' }} aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{c.summary}</span>
                        {c.primary && <span className="text-[11px] text-slate-500">メイン</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="期間（今日から）">
                <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className={inputClass}>
                  {RANGES.map((r) => (
                    <option key={r.weeks} value={r.weeks}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="新しく入れる予定の分類">
                <CategorySelect value={category} categories={categories} onChange={setCategory} />
              </Field>
            </div>

            {setTemplates.length > 0 && (
              <section>
                <h3 className="mb-1 text-xs font-bold text-navy">セットで入れる予定</h3>
                <p className="mb-1.5 text-[11px] leading-relaxed text-slate-500">
                  予定の名前に目印の言葉が全部入っていれば、そのセット（細かいToDoつき）で入れます。残りの部分はお客さんの名前になります（例：目印「対面パーソナル」、予定「山岸さん 対面パーソナル」→ 山岸さん）。
                </p>
                <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                  {setTemplates.map((t) => {
                    const rule = ruleOf(t);
                    return (
                      <li key={t.id} className="rounded-lg border border-navy-100 px-3 py-2">
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={(e) => changeRule(t, { enabled: e.target.checked })}
                            className="h-4 w-4 accent-navy"
                          />
                          <span className="min-w-0 flex-1 truncate font-bold text-navy">{t.name}</span>
                          <span className="shrink-0 text-[11px] text-slate-500">{t.items.length}件</span>
                        </label>
                        {rule.enabled && (
                          <label className="mt-1.5 flex items-center gap-2 text-xs text-slate-600">
                            <span className="shrink-0">目印の言葉</span>
                            <input
                              value={rule.keyword}
                              onChange={(e) => changeRule(t, { keyword: e.target.value })}
                              placeholder={defaultKeyword(t)}
                              className={`${inputClass} py-1`}
                            />
                          </label>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4 accent-navy" />
              終日の予定も取り込む（その日の旗の欄に入れます）
            </label>

            <p className="rounded-lg bg-canvas px-3 py-2 text-[11px] leading-relaxed text-slate-500">
              何度押しても、同じ予定は二重に入りません。Google 側で時間や名前が変わった予定は直し、消えた予定は（終わっていなければ）外します。アプリで動かした時刻や分類は、Google 側が変わらない限りそのままです。
            </p>
          </>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
            {error}
          </p>
        )}
        {result && (
          <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800" role="status">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {result}
          </p>
        )}
      </div>
    </Modal>
  );
}
