import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, type NewTodo, type Todo, type TodoPatch } from '@/lib/supabase';
import { describeDbError } from '@/hooks/dbError';

/**
 * 元に戻す（Ctrl+Z）ための記録。1回の操作 = 1つの「段」で、段の中に「戻し方」を入れておく。
 *   remove  … 追加したものを消して戻す
 *   restore … 消したものを入れ直して戻す（セットのコアなら、サブタスクとのつながりも戻す）
 *   revert  … 変える前の値に書き戻す
 */
type UndoOp =
  | { kind: 'remove'; ids: string[] }
  | { kind: 'restore'; row: Todo; children: string[] }
  | { kind: 'revert'; id: string; patch: Partial<Todo> };

interface UndoStep {
  label: string;
  ops: UndoOp[];
}

/** 覚えておく段の数 */
const UNDO_MAX = 50;

const titleOf = (t: { title: string } | undefined) => (t ? `「${t.title}」` : '');

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

  // ---- 元に戻すための記録 ------------------------------------------------------
  const stackRef = useRef<UndoStep[]>([]);
  /** いま記録を受け付けている段。同じ瞬間に起きた操作（セットの移動など）は1つの段にまとめる */
  const openRef = useRef<UndoStep | null>(null);
  const undoingRef = useRef(false);

  const record = useCallback((label: string, op: UndoOp) => {
    if (undoingRef.current) return null;
    let step = openRef.current;
    if (!step) {
      const fresh: UndoStep = { label, ops: [] };
      step = fresh;
      openRef.current = fresh;
      // 同じ瞬間の操作が終わったら、段を閉じる
      setTimeout(() => {
        if (openRef.current === fresh) openRef.current = null;
      }, 0);
    }
    if (step.ops.length === 0) {
      stackRef.current.push(step);
      if (stackRef.current.length > UNDO_MAX) stackRef.current.shift();
    }
    step.ops.push(op);
    return op;
  }, []);

  /** 保存に失敗した操作は、記録から外す */
  const discard = useCallback((op: UndoOp | null) => {
    if (!op) return;
    const stack = stackRef.current;
    for (let i = stack.length - 1; i >= 0; i--) {
      const at = stack[i].ops.indexOf(op);
      if (at < 0) continue;
      stack[i].ops.splice(at, 1);
      if (stack[i].ops.length === 0) stack.splice(i, 1);
      return;
    }
  }, []);

  /** 時間をまたぐ一連の操作（Googleカレンダーの取り込みなど）を、1回の Ctrl+Z で戻せるようにまとめる */
  const undoGroup = useCallback(async <T,>(label: string, fn: () => Promise<T>) => {
    const step: UndoStep = { label, ops: [] };
    openRef.current = step;
    try {
      return await fn();
    } finally {
      if (openRef.current === step) openRef.current = null;
    }
  }, []);

  /** 1つ前の操作を元に戻す。戻したら、その操作の名前を返す（何もなければ null） */
  const undo = useCallback(async () => {
    if (undoingRef.current) return null;
    const step = stackRef.current.pop();
    if (!step) return null;
    if (openRef.current === step) openRef.current = null;
    undoingRef.current = true;
    try {
      for (const op of [...step.ops].reverse()) {
        if (op.kind === 'remove') {
          if (op.ids.length === 0) continue;
          const { error: e } = await supabase.from('todos').delete().in('id', op.ids);
          if (e) throw e;
          const gone = new Set(op.ids);
          setTodos((prev) =>
            prev.filter((t) => !gone.has(t.id)).map((t) => (t.parent_id && gone.has(t.parent_id) ? { ...t, parent_id: null } : t)),
          );
        } else if (op.kind === 'restore') {
          const { error: e } = await supabase.from('todos').insert(op.row);
          if (e) throw e;
          if (op.children.length) {
            const { error: e2 } = await supabase.from('todos').update({ parent_id: op.row.id }).in('id', op.children);
            if (e2) throw e2;
          }
          const kids = new Set(op.children);
          setTodos((prev) => [op.row, ...prev.map((t) => (kids.has(t.id) ? { ...t, parent_id: op.row.id } : t))]);
        } else {
          const { error: e } = await supabase.from('todos').update(op.patch).eq('id', op.id);
          if (e) throw e;
          setTodos((prev) => prev.map((t) => (t.id === op.id ? { ...t, ...op.patch } : t)));
        }
      }
      return step.label;
    } catch (e) {
      setError(describeDbError(e as Parameters<typeof describeDbError>[0], '元に戻せませんでした。'));
      return null;
    } finally {
      undoingRef.current = false;
    }
  }, []);

  // ---- 追加・変更・削除 --------------------------------------------------------
  const addTodos = useCallback(
    async (items: NewTodo[]) => {
      if (items.length === 0) return false;
      const op = record(items.length === 1 ? `${titleOf(items[0])}の追加` : `${items.length}件の追加`, { kind: 'remove', ids: [] });
      const { data, error: e } = await supabase.from('todos').insert(items).select();
      if (e || !data) {
        discard(op);
        setError(describeDbError(e, 'タスクを追加できませんでした。'));
        return false;
      }
      if (op?.kind === 'remove') op.ids.push(...(data as Todo[]).map((t) => t.id));
      setTodos((prev) => [...(data as Todo[]), ...prev]);
      return true;
    },
    [record, discard],
  );

  /** コアタスクを登録してから、サブタスクをコアにつなげて登録する */
  const addTaskSet = useCallback(
    async (core: NewTodo, subs: NewTodo[]) => {
      const op = record(`${titleOf(core)}の追加`, { kind: 'remove', ids: [] });
      const { data: created, error: e1 } = await supabase.from('todos').insert(core).select().single();
      if (e1 || !created) {
        discard(op);
        setError(describeDbError(e1, 'タスクを追加できませんでした。'));
        return false;
      }
      const ids = op?.kind === 'remove' ? op.ids : [];
      ids.push((created as Todo).id);
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
          ids.push(...children.map((c) => c.id));
        }
      }
      setTodos((prev) => [created as Todo, ...children, ...prev]);
      return true;
    },
    [record, discard],
  );

  const updateTodo = useCallback(
    async (id: string, patch: TodoPatch) => {
      const before = todosRef.current.find((t) => t.id === id);
      if (!before) return false;
      // 変える項目だけ、前の値を覚えておく
      const prevValues = Object.fromEntries(Object.keys(patch).map((k) => [k, before[k as keyof Todo]])) as Partial<Todo>;
      const what = 'completed' in patch && Object.keys(patch).length === 1 ? '完了の切り替え' : 'scheduled_at' in patch ? '移動' : '変更';
      const op = record(`${titleOf(before)}の${what}`, { kind: 'revert', id, patch: prevValues });
      setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      const { error: e } = await supabase.from('todos').update(patch).eq('id', id);
      if (e) {
        discard(op);
        setTodos((prev) => prev.map((t) => (t.id === id ? before : t)));
        setError(describeDbError(e, '更新に失敗しました。'));
        return false;
      }
      return true;
    },
    [record, discard],
  );

  const deleteTodo = useCallback(
    async (id: string) => {
      const before = todosRef.current;
      const row = before.find((t) => t.id === id);
      // セットのコアを消すと、サブタスクとのつながりはデータベース側で外れる。戻すときにつなぎ直す
      const children = before.filter((t) => t.parent_id === id).map((t) => t.id);
      const op = row ? record(`${titleOf(row)}の削除`, { kind: 'restore', row, children }) : null;
      setTodos((prev) => prev.filter((t) => t.id !== id).map((t) => (t.parent_id === id ? { ...t, parent_id: null } : t)));
      const { error: e } = await supabase.from('todos').delete().eq('id', id);
      if (e) {
        discard(op);
        setTodos(before);
        setError(describeDbError(e, '削除に失敗しました。'));
        return false;
      }
      return true;
    },
    [record, discard],
  );

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

  return { todos, loading, error, addTodos, addTaskSet, updateTodo, deleteTodo, mergeTodos, dropTodos, clearError, undo, undoGroup };
}
