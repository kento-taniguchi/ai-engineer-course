/*
# タスク・定期タスクにも分類を付け、分類ごとの色を保存する

1. todos / recurring_tasks に category 列（空文字は未分類）
2. 新しい表 task_categories … 分類の名前と、カレンダーで使う色
*/

ALTER TABLE todos ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '';
ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_todos_category ON todos (category);

CREATE TABLE IF NOT EXISTS task_categories (
  name text PRIMARY KEY CHECK (length(btrim(name)) > 0),
  color text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE task_categories ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON task_categories TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_task_categories" ON task_categories;
CREATE POLICY "anon_select_task_categories" ON task_categories FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_task_categories" ON task_categories;
CREATE POLICY "anon_insert_task_categories" ON task_categories FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_task_categories" ON task_categories;
CREATE POLICY "anon_update_task_categories" ON task_categories FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_task_categories" ON task_categories;
CREATE POLICY "anon_delete_task_categories" ON task_categories FOR DELETE
TO anon, authenticated USING (true);

-- テンプレートで使っている分類を、最初から色付きで登録しておく（作った順に色を割り当てる）
INSERT INTO task_categories (name, color, created_at)
SELECT c.name,
       (ARRAY['teal','violet','emerald','sky','fuchsia','cyan','slate','indigo'])[((row_number() OVER (ORDER BY c.first_at) - 1) % 8) + 1],
       c.first_at
FROM (
  SELECT btrim(category) AS name, min(created_at) AS first_at
  FROM task_templates
  WHERE btrim(category) <> ''
  GROUP BY btrim(category)
) c
ON CONFLICT (name) DO NOTHING;

-- 追加した表と列をすぐ使えるように、Supabase の API に構成の再読み込みを伝える
NOTIFY pgrst, 'reload schema';
