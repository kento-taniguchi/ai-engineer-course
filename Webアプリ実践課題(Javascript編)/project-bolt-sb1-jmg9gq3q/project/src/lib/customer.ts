import type { TaskTemplate } from '@/lib/supabase';

/** テンプレートの文中に書くと、登録するときにお客さんの名前に置き換わる印 */
export const CUSTOMER_TOKEN = '{お客さん}';

export const hasCustomerToken = (t: TaskTemplate) =>
  t.name.includes(CUSTOMER_TOKEN) || t.items.some((i) => i.title.includes(CUSTOMER_TOKEN));

/** 印をお客さんの名前に置き換える。名前が空なら印だけ取り除く */
export const fillCustomer = (text: string, name: string) =>
  text.split(CUSTOMER_TOKEN).join(name.trim()).replace(/\s{2,}/g, ' ').trim();

/** 前に入れたお客さんの名前（新しい順）を覚えておくキー */
export const CUSTOMER_HISTORY_KEY = 'todo.customerNames';

/**
 * すでに登録したタスクから、このテンプレートで使ったお客さんの名前を拾う（新しい順）。
 * 例：テンプレート名「{お客さん} BASE-PLUS 対面パーソナル」と、タスク「山岸さん BASE-PLUS 対面パーソナル」→「山岸さん」
 */
export function pastCustomers(t: TaskTemplate, todos: { title: string; set_name: string | null; created_at: string }[]) {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [t.name, ...t.items.map((i) => i.title)]
    .filter((s) => s.includes(CUSTOMER_TOKEN))
    .map((s) => new RegExp(`^${s.trim().split(CUSTOMER_TOKEN).map(escape).join('(.+?)')}$`));
  const names: string[] = [];
  const sorted = [...todos].sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const todo of sorted) {
    for (const text of [todo.set_name, todo.title]) {
      if (!text) continue;
      for (const re of patterns) {
        const name = re.exec(text.trim())?.[1]?.trim();
        if (name && !names.includes(name)) names.push(name);
      }
    }
  }
  return names;
}
