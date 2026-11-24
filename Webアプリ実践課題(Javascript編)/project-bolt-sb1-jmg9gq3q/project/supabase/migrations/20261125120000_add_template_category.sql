/*
# テンプレートに「分類」を追加する（例：野球事業、高齢者事業、AI事業、物販事業）

- category (text) … 分類名。空文字は「未分類」
*/

ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_task_templates_category ON task_templates (category);

NOTIFY pgrst, 'reload schema';
