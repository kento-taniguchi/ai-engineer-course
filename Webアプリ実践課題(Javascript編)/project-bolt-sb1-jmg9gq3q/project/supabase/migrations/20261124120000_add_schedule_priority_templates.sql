/*
# タスクに「期限・優先度・カレンダー日時」を追加し、テンプレート用の表を作る

1. todos に追加する列
- notes (text)              … メモ
- priority (smallint 1〜3)   … 優先度（1=高, 2=中, 3=低）
- due_at (timestamptz)      … 期限
- scheduled_at (timestamptz)… カレンダー上で実施する日時
- duration_minutes (int)    … 所要時間（分）
- set_name (text)           … どのセットから登録されたか

2. 新しい表 task_templates
- name  … テンプレート名
- items … 登録するタスクの一覧（1件ならテンプレート、複数ならセット）

3. セキュリティ
- todos と同じく、ログインなしの共有アプリとして anon / authenticated に読み書きを許可
*/

ALTER TABLE todos ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
ALTER TABLE todos ADD COLUMN IF NOT EXISTS priority smallint NOT NULL DEFAULT 2;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS due_at timestamptz;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 60;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS set_name text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'todos_priority_check') THEN
    ALTER TABLE todos ADD CONSTRAINT todos_priority_check CHECK (priority BETWEEN 1 AND 3);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'todos_duration_check') THEN
    ALTER TABLE todos ADD CONSTRAINT todos_duration_check CHECK (duration_minutes BETWEEN 5 AND 1440);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_todos_scheduled_at ON todos (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_todos_due_at ON todos (due_at);

CREATE TABLE IF NOT EXISTS task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON task_templates TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_task_templates" ON task_templates;
CREATE POLICY "anon_select_task_templates" ON task_templates FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_task_templates" ON task_templates;
CREATE POLICY "anon_insert_task_templates" ON task_templates FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_task_templates" ON task_templates;
CREATE POLICY "anon_update_task_templates" ON task_templates FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_task_templates" ON task_templates;
CREATE POLICY "anon_delete_task_templates" ON task_templates FOR DELETE
TO anon, authenticated USING (true);

-- 追加した列をすぐ使えるように、Supabase の API に構成の再読み込みを伝える
NOTIFY pgrst, 'reload schema';
