import { useCallback, useEffect, useState } from 'react';
import { supabase, type TaskTemplate, type TemplateItem } from '@/lib/supabase';
import { describeDbError } from '@/hooks/dbError';
import { normalizeItem } from '@/lib/tasks';

/** 読み込んだテンプレートの中身を今の形式にそろえる */
const normalize = (t: TaskTemplate): TaskTemplate => ({
  ...t,
  category: t.category ?? '',
  items: (Array.isArray(t.items) ? t.items : []).map(normalizeItem),
});

export function useTemplates() {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error: e } = await supabase
        .from('task_templates')
        .select('*')
        .order('created_at', { ascending: true });
      if (!active) return;
      if (e) setError(describeDbError(e, 'テンプレートを読み込めませんでした。'));
      else setTemplates(((data ?? []) as TaskTemplate[]).map(normalize));
    })();
    return () => {
      active = false;
    };
  }, []);

  const createTemplate = useCallback(async (name: string, category: string, items: TemplateItem[]) => {
    const { data, error: e } = await supabase.from('task_templates').insert({ name, category, items }).select().single();
    if (e || !data) {
      setError(describeDbError(e, 'テンプレートを保存できませんでした。'));
      return false;
    }
    setTemplates((prev) => [...prev, normalize(data as TaskTemplate)]);
    return true;
  }, []);

  const updateTemplate = useCallback(async (id: string, name: string, category: string, items: TemplateItem[]) => {
    const { data, error: e } = await supabase
      .from('task_templates')
      .update({ name, category, items })
      .eq('id', id)
      .select()
      .single();
    if (e || !data) {
      setError(describeDbError(e, 'テンプレートを更新できませんでした。'));
      return false;
    }
    setTemplates((prev) => prev.map((t) => (t.id === id ? normalize(data as TaskTemplate) : t)));
    return true;
  }, []);

  const deleteTemplate = useCallback(async (id: string) => {
    const { error: e } = await supabase.from('task_templates').delete().eq('id', id);
    if (e) {
      setError(describeDbError(e, 'テンプレートを削除できませんでした。'));
      return false;
    }
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    return true;
  }, []);

  const clearError = useCallback(() => setError(null), []);

  /** 使われている分類の一覧（作った順） */
  const categories = [...new Set(templates.map((t) => t.category.trim()).filter(Boolean))];

  return { templates, categories, error, createTemplate, updateTemplate, deleteTemplate, clearError };
}
