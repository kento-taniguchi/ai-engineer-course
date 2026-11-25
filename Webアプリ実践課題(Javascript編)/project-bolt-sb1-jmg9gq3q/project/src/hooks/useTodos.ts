import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, type NewTodo, type Todo, type TodoPatch } from '@/lib/supabase';
import { describeDbError } from '@/hooks/dbError';

export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const todosRef = useRef<Todo[]>([]);

  useEffect(() => {
    todosRef.current = todos;
  }, [todos]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error: e } = await supabase.from('todos').select('*').order('created_at', { ascending: false });
      if (!active) return;
      if (e) setError(describeDbError(e, 'タスクを読み込めませんでした。'));
      else setTodos((data ?? []) as Todo[]);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const addTodos = useCallback(async (items: NewTodo[]) => {
    if (items.length === 0) return false;
    const { data, error: e } = await supabase.from('todos').insert(items).select();
    if (e || !data) {
      setError(describeDbError(e, 'タスクを追加できませんでした。'));
      return false;
    }
    setTodos((prev) => [...(data as Todo[]), ...prev]);
    return true;
  }, []);

  /** コアタスクを登録してから、サブタスクをコアにつなげて登録する */
  const addTaskSet = useCallback(async (core: NewTodo, subs: NewTodo[]) => {
    const { data: created, error: e1 } = await supabase.from('todos').insert(core).select().single();
    if (e1 || !created) {
      setError(describeDbError(e1, 'タスクを追加できませんでした。'));
      return false;
    }
    let children: Todo[] = [];
    if (subs.length > 0) {
      const { data, error: e2 } = await supabase
        .from('todos')
        .insert(subs.map((s) => ({ ...s, parent_id: (created as Todo).id })))
        .select();
      if (e2 || !data) {
        setError(describeDbError(e2, 'サブタスクを追加できませんでした。'));
      } else {
        children = data as Todo[];
      }
    }
    setTodos((prev) => [created as Todo, ...children, ...prev]);
    return true;
  }, []);

  const updateTodo = useCallback(async (id: string, patch: TodoPatch) => {
    const before = todosRef.current.find((t) => t.id === id);
    if (!before) return false;
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const { error: e } = await supabase.from('todos').update(patch).eq('id', id);
    if (e) {
      setTodos((prev) => prev.map((t) => (t.id === id ? before : t)));
      setError(describeDbError(e, '更新に失敗しました。'));
      return false;
    }
    return true;
  }, []);

  const deleteTodo = useCallback(async (id: string) => {
    const before = todosRef.current;
    setTodos((prev) => prev.filter((t) => t.id !== id));
    const { error: e } = await supabase.from('todos').delete().eq('id', id);
    if (e) {
      setTodos(before);
      setError(describeDbError(e, '削除に失敗しました。'));
      return false;
    }
    return true;
  }, []);

  /** ほかの所（定期タスク）で作った・消したタスクを画面に反映する */
  const mergeTodos = useCallback((rows: Todo[]) => {
    if (rows.length === 0) return;
    setTodos((prev) => {
      const known = new Set(prev.map((t) => t.id));
      return [...rows.filter((r) => !known.has(r.id)), ...prev];
    });
  }, []);
  const dropTodos = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const gone = new Set(ids);
    setTodos((prev) => prev.filter((t) => !gone.has(t.id)));
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { todos, loading, error, addTodos, addTaskSet, updateTodo, deleteTodo, mergeTodos, dropTodos, clearError };
}
