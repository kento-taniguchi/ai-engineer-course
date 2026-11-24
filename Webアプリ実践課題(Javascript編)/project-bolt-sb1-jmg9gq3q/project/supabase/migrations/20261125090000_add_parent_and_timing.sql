/*
# コアタスクとサブタスクのつながりを保存する

1. todos に追加する列
- parent_id (uuid) … サブタスクの場合、基準になるコアタスクのID
  （コアタスクを消してもサブタスクは残し、つながりだけ外す）
- timing (jsonb)   … コアの実施日時から見た時刻の決め方
  例：{"kind":"offset","minutes":60}         → 実施の1時間後
      {"kind":"day","days":1,"time":"09:00"} → 翌日の 9:00
*/

ALTER TABLE todos ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES todos(id) ON DELETE SET NULL;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS timing jsonb;

CREATE INDEX IF NOT EXISTS idx_todos_parent_id ON todos (parent_id);

NOTIFY pgrst, 'reload schema';
