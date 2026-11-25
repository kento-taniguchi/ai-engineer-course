import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, type RecurringDraft, type RecurringTask, type Todo } from '@/lib/supabase';
import { addDays, dayKey } from '@/lib/date';
import { pendingOccurrences } from '@/lib/recurrence';
import { describeDbError } from '@/hooks/dbError';

const yesterdayKey = () => dayKey(addDays(new Date(), -1));

/** 定期タスクのルールの読み書きと、毎日の分のタスク作成 */
export function useRecurring() {
  const [tasks, setTasks] = useState<RecurringTask[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tasksRef = useRef<RecurringTask[]>([]);
  const running = useRef(false);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error: e } = await supabase.from('recurring_tasks').select('*').order('created_at');
      if (!active) return;
      if (e) setError(describeDbError(e, '定期タスクを読み込めませんでした。'));
      else {
        setTasks((data ?? []) as RecurringTask[]);
        setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  /** まだ作っていない日の分のタスクを作り、作ったタスクを返す */
  const generate = useCallback(async (today: Date) => {
    if (running.current) return [];
    running.current = true;
    const created: Todo[] = [];
    try {
      for (const r of tasksRef.current) {
        const { items, until } = pendingOccurrences(r, today);
        if (!until) continue;
        if (items.length > 0) {
          // 同じ日の分がすでにあれば作らない（別のタブで同時に開いていても二重にならない）
          const { data, error: e } = await supabase
            .from('todos')
            .upsert(items, { onConflict: 'recurrence_id,occurs_on', ignoreDuplicates: true })
            .select();
          if (e) {
            setError(describeDbError(e, '定期タスクを作れませんでした。'));
            continue;
          }
          created.push(...((data ?? []) as Todo[]));
        }
        const { error: e2 } = await supabase.from('recurring_tasks').update({ generated_until: until }).eq('id', r.id);
        if (!e2) setTasks((prev) => prev.map((t) => (t.id === r.id ? { ...t, generated_until: until } : t)));
      }
    } finally {
      running.current = false;
    }
    return created;
  }, []);

  /** 今日以降の、まだ終わっていない分を消す（ルールの変更・一時停止・削除のとき）。消したタスクのIDを返す */
  const clearUpcoming = async (id: string) => {
    const { data, error: e } = await supabase
      .from('todos')
      .delete()
      .eq('recurrence_id', id)
      .eq('completed', false)
      .gte('occurs_on', dayKey(new Date()))
      .select('id');
    if (e) {
      setError(describeDbError(e, '予定を更新できませんでした。'));
      return null;
    }
    return (data ?? []).map((d) => d.id as string);
  };

  const create = useCallback(async (draft: RecurringDraft) => {
    const { data, error: e } = await supabase.from('recurring_tasks').insert(draft).select().single();
    if (e || !data) {
      setError(describeDbError(e, '定期タスクを登録できませんでした。'));
      return false;
    }
    setTasks((prev) => [...prev, data as RecurringTask]);
    return true;
  }, []);

  /** ルールを変えたら、今日以降の分を作り直す */
  const update = useCallback(async (id: string, draft: RecurringDraft) => {
    const removed = await clearUpcoming(id);
    if (!removed) return null;
    const patch = { ...draft, generated_until: yesterdayKey() };
    const { error: e } = await supabase.from('recurring_tasks').update(patch).eq('id', id);
    if (e) {
      setError(describeDbError(e, '定期タスクを保存できませんでした。'));
      return null;
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    return removed;
  }, []);

  /** 一時停止すると今日以降の分を消し、再開すると今日の分から作り直す */
  const setActive = useCallback(async (id: string, active: boolean) => {
    const removed = active ? [] : await clearUpcoming(id);
    if (!removed) return null;
    const patch = { active, generated_until: yesterdayKey() };
    const { error: e } = await supabase.from('recurring_tasks').update(patch).eq('id', id);
    if (e) {
      setError(describeDbError(e, '定期タスクを保存できませんでした。'));
      return null;
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    return removed;
  }, []);

  /** ルールを削除する。今日以降のまだ終わっていない分も消す（終わった分・過去の分は残す） */
  const remove = useCallback(async (id: string) => {
    const removed = await clearUpcoming(id);
    if (!removed) return null;
    const { error: e } = await supabase.from('recurring_tasks').delete().eq('id', id);
    if (e) {
      setError(describeDbError(e, '定期タスクを削除できませんでした。'));
      return null;
    }
    setTasks((prev) => prev.filter((t) => t.id !== id));
    return removed;
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { tasks, ready, error, generate, create, update, setActive, remove, clearError };
}
