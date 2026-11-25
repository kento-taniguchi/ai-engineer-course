/*
# 定期タスク（毎日・平日・毎週・毎月・N日ごと）

1. 新しい表 recurring_tasks … 繰り返しのルール
- title / notes / priority / duration_minutes … 作るタスクの中身
- time            … 実施時刻 "HH:mm"（なしなら時間指定なし）
- rule            … 繰り返し方 {kind:'daily',interval} / {kind:'weekly',weekdays,interval} / {kind:'monthly',day}
- start_date      … 開始日
- active          … false なら一時停止
- generated_until … どの日の分までタスクを作ったか（削除したタスクを作り直さないため）

2. todos に追加する列
- recurrence_id … どの定期タスクから作られたか
- occurs_on     … 何日の分か（同じ日の分を二重に作らないよう、recurrence_id と組で一意）
*/

CREATE TABLE IF NOT EXISTS recurring_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  notes text NOT NULL DEFAULT '',
  priority smallint NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  duration_minutes integer NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 5 AND 1440),
  time text CHECK (time IS NULL OR time ~ '^\d{2}:\d{2}$'),
  rule jsonb NOT NULL,
  start_date date NOT NULL DEFAULT current_date,
  active boolean NOT NULL DEFAULT true,
  generated_until date,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recurring_tasks ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON recurring_tasks TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_recurring_tasks" ON recurring_tasks;
CREATE POLICY "anon_select_recurring_tasks" ON recurring_tasks FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_recurring_tasks" ON recurring_tasks;
CREATE POLICY "anon_insert_recurring_tasks" ON recurring_tasks FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_recurring_tasks" ON recurring_tasks;
CREATE POLICY "anon_update_recurring_tasks" ON recurring_tasks FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_recurring_tasks" ON recurring_tasks;
CREATE POLICY "anon_delete_recurring_tasks" ON recurring_tasks FOR DELETE
TO anon, authenticated USING (true);

ALTER TABLE todos ADD COLUMN IF NOT EXISTS recurrence_id uuid REFERENCES recurring_tasks(id) ON DELETE SET NULL;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS occurs_on date;

CREATE UNIQUE INDEX IF NOT EXISTS uq_todos_recurrence_day ON todos (recurrence_id, occurs_on);

-- 追加した表と列をすぐ使えるように、Supabase の API に構成の再読み込みを伝える
NOTIFY pgrst, 'reload schema';
