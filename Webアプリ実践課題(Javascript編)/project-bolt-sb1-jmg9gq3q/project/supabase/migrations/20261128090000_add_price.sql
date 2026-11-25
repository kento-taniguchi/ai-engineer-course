/*
  # 単価（売上管理）

  1. todos.price            … そのタスク（予定）の単価（円）。NULL は単価なし
  2. recurring_tasks.price  … 定期タスクから作るタスクに付ける単価
  ※ テンプレートの単価は items（jsonb）の中に price として入れるので、表の変更は不要
*/

ALTER TABLE todos ADD COLUMN IF NOT EXISTS price integer CHECK (price IS NULL OR price >= 0);
ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS price integer CHECK (price IS NULL OR price >= 0);

NOTIFY pgrst, 'reload schema';
