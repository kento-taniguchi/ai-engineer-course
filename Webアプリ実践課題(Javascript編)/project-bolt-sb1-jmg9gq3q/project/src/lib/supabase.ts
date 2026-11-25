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
  /** 定期タスクから作られた場合、そのルールのID */
  recurrence_id: string | null;
  /** 定期タスクの何日の分か（YYYY-MM-DD） */
  occurs_on: string | null;
  /** 分類（事業）。空文字は未分類 */
  category: string;
  /** 単価（円）。null は単価なし */
  price: number | null;
  created_at: string;
}

export type TodoPatch = Partial<
  Pick<
    Todo,
    | 'title'
    | 'notes'
    | 'completed'
    | 'priority'
    | 'due_at'
    | 'scheduled_at'
    | 'duration_minutes'
    | 'set_name'
    | 'parent_id'
    | 'timing'
    | 'category'
    | 'price'
  >
>;

export type NewTodo = TodoPatch & { title: string; recurrence_id?: string | null; occurs_on?: string | null };

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
  /** 単価（円）。セットではコアタスク（1行目）に付ける */
  price?: number | null;
}

export interface TaskTemplate {
  id: string;
  name: string;
  /** 分類。空文字は未分類 */
  category: string;
  items: TemplateItem[];
  created_at: string;
}

/**
 * 繰り返し方
 * - daily   … interval 日ごと（1 = 毎日）
 * - weekly  … weekdays の曜日（0=日〜6=土）を interval 週ごと（1 = 毎週）
 * - monthly … 毎月 day 日（0 = 末日）
 */
export type RecurrenceRule =
  | { kind: 'daily'; interval: number }
  | { kind: 'weekly'; weekdays: number[]; interval: number }
  | { kind: 'monthly'; day: number };

export interface RecurringTask {
  id: string;
  title: string;
  notes: string;
  priority: Priority;
  duration_minutes: number;
  /** 実施時刻 "HH:mm"。null は時間指定なし */
  time: string | null;
  rule: RecurrenceRule;
  /** YYYY-MM-DD */
  start_date: string;
  active: boolean;
  /** この日の分までタスクを作った（YYYY-MM-DD） */
  generated_until: string | null;
  /** 分類（事業）。空文字は未分類 */
  category: string;
  /** 単価（円）。null は単価なし */
  price: number | null;
  created_at: string;
}

export type RecurringDraft = Pick<RecurringTask, 'title' | 'notes' | 'priority' | 'duration_minutes' | 'time' | 'rule' | 'start_date'> &
  Partial<Pick<RecurringTask, 'category' | 'price'>>;
