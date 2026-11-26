/*
  # Google カレンダーから取り込んだ予定を見分ける

  - google_event_id … どのカレンダーのどの予定か（「カレンダーID:予定ID」）。同じ予定を二重に取り込まないために使う
  - google_updated  … Google 側で最後に変更された日時。変わっていたときだけ、アプリ側を直す
*/

ALTER TABLE todos ADD COLUMN IF NOT EXISTS google_event_id text;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS google_updated timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS todos_google_event_id_key ON todos (google_event_id);

NOTIFY pgrst, 'reload schema';
