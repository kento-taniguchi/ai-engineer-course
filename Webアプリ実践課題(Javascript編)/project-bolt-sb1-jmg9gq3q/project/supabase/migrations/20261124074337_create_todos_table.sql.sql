/*
# Create todos table (single-tenant, no auth)

1. New Tables
- `todos`
- `id` (uuid, primary key, auto-generated)
- `title` (text, not null) - the task text
- `completed` (boolean, default false) - whether the task is done
- `created_at` (timestamp) - when the task was added
2. Security
- Enable RLS on `todos`.
- Grant SELECT, INSERT, UPDATE, DELETE to `anon` and `authenticated` so the Data API can reach the table.
- Allow anon + authenticated CRUD because this is a single-tenant app with no sign-in; the data is intentionally shared/public.
3. Notes
- This app has no sign-in screen, so policies target `anon, authenticated` with `USING (true)`.
- Index on `created_at` for ordering the list.
*/

CREATE TABLE IF NOT EXISTS todos (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
title text NOT NULL,
completed boolean NOT NULL DEFAULT false,
created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos (created_at DESC);

ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON todos TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_todos" ON todos;
CREATE POLICY "anon_select_todos" ON todos FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_todos" ON todos;
CREATE POLICY "anon_insert_todos" ON todos FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_todos" ON todos;
CREATE POLICY "anon_update_todos" ON todos FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_todos" ON todos;
CREATE POLICY "anon_delete_todos" ON todos FOR DELETE
TO anon, authenticated USING (true);
