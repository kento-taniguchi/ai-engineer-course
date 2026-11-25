import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PALETTE, UNCATEGORIZED_COLOR, nextColorKey, paletteOf, type CategoryColor } from '@/lib/colors';
import { describeDbError } from '@/hooks/dbError';

interface Row {
  name: string;
  color: string;
}

/** 分類の色（task_categories 表）を読み書きする */
export function useCategoryColors() {
  const [rows, setRows] = useState<Row[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rowsRef = useRef<Row[]>([]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error: e } = await supabase.from('task_categories').select('name,color').order('created_at');
      if (!active) return;
      if (e) setError(describeDbError(e, '分類の色を読み込めませんでした。'));
      else {
        setRows((data ?? []) as Row[]);
        setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  /** まだ色が決まっていない分類に、空いている色を割り当てて保存する */
  const ensure = useCallback(async (names: string[]) => {
    const known = new Set(rowsRef.current.map((r) => r.name));
    const missing = [...new Set(names.map((n) => n.trim()).filter((n) => n && !known.has(n)))];
    if (missing.length === 0) return;
    const used = rowsRef.current.map((r) => r.color);
    const added: Row[] = missing.map((name) => {
      const color = nextColorKey(used);
      used.push(color);
      return { name, color };
    });
    setRows((prev) => [...prev, ...added]);
    const { error: e } = await supabase.from('task_categories').upsert(added, { onConflict: 'name', ignoreDuplicates: true });
    if (e) setError(describeDbError(e, '分類の色を保存できませんでした。'));
  }, []);

  const setColor = useCallback(async (name: string, color: string) => {
    const before = rowsRef.current;
    setRows((prev) => (prev.some((r) => r.name === name) ? prev.map((r) => (r.name === name ? { ...r, color } : r)) : [...prev, { name, color }]));
    const { error: e } = await supabase.from('task_categories').upsert({ name, color }, { onConflict: 'name' });
    if (e) {
      setRows(before);
      setError(describeDbError(e, '分類の色を保存できませんでした。'));
    }
  }, []);

  const colorOf = useCallback(
    (category: string | null | undefined): CategoryColor => {
      const name = (category ?? '').trim();
      if (!name) return UNCATEGORIZED_COLOR;
      return paletteOf(rows.find((r) => r.name === name)?.color) ?? PALETTE[0];
    },
    [rows],
  );

  const clearError = useCallback(() => setError(null), []);

  return { names: rows.map((r) => r.name), ready, error, ensure, setColor, colorOf, clearError };
}
