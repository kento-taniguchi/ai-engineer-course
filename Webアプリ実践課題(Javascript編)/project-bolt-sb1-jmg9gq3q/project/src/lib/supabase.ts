import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** 1=高, 2=中, 3=低 */
export type Priority = 1 | 2 | 3;

export interface Todo {
  id: string;
  title: string;
  notes: string;
  completed: boolean;
  priority: Priority;
  /** 期限 */
  due_at: string | null;
  /** カレンダー上で実施する日時 */
  scheduled_at: string | null;
  duration_minutes: number;
  /** セットから登録された場合のセット名 */
  set_name: string | null;
  /** サブタスクの場合、基準になるコアタスクのID */
  parent_id: string | null;
  /** コアの実施日時から見た時刻の決め方 */
  timing: ItemTiming | null;
  created_at: string;
}

export type TodoPatch = Partial<
  Pick<
    Todo,
    'title' | 'notes' | 'completed' | 'priority' | 'due_at' | 'scheduled_at' | 'duration_minutes' | 'set_name' | 'parent_id' | 'timing'
  >
>;

export type NewTodo = TodoPatch & { title: string };

/**
 * サブタスクの時刻の決め方
 * - none   … 時間指定なし
 * - offset … 実施日時から ±分（例：60 = 実施の1時間後）
 * - day    … 実施日から ±日 の決まった時刻（例：days 1, time "09:00" = 翌日 9:00）
 */
export type ItemTiming =
  | { kind: 'none' }
  | { kind: 'offset'; minutes: number }
  | { kind: 'day'; days: number; time: string };

/** テンプレートの1行。セットの場合、1行目がコアタスク、2行目以降がサブタスク */
export interface TemplateItem {
  title: string;
  priority: Priority;
  duration_minutes: number;
  timing: ItemTiming;
}

export interface TaskTemplate {
  id: string;
  name: string;
  /** 分類（例：野球事業）。空文字は未分類 */
  category: string;
  items: TemplateItem[];
  created_at: string;
}
