/*
# Chatbot app — conversations and messages tables

1. New Tables
- `conversations`
  - `id` (uuid, primary key)
  - `dify_conversation_id` (text, nullable — Dify's conversation id returned by the API; null until first message gets a response)
  - `title` (text — auto-set from first message, editable later)
  - `created_at` (timestamptz, defaults to now())
  - `updated_at` (timestamptz, defaults to now())
- `messages`
  - `id` (uuid, primary key)
  - `conversation_id` (uuid, foreign key to conversations.id ON DELETE CASCADE)
  - `role` (text — 'user' or 'assistant')
  - `content` (text — message text)
  - `created_at` (timestamptz, defaults to now())

2. Security
- Enable RLS on both tables.
- Grant CRUD to `anon` + `authenticated` — this is a no-sign-in chatbot app, so data is intentionally public/shared.
- Add 4 CRUD policies (select/insert/update/delete) on each table allowing anon + authenticated.
- `service_role` granted for edge function access.
*/

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dify_conversation_id text,
  title text NOT NULL DEFAULT 'New Chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations (updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON conversations TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON conversations TO service_role;

DROP POLICY IF EXISTS "anon_select_conversations" ON conversations;
CREATE POLICY "anon_select_conversations" ON conversations FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_conversations" ON conversations;
CREATE POLICY "anon_insert_conversations" ON conversations FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_conversations" ON conversations;
CREATE POLICY "anon_update_conversations" ON conversations FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_conversations" ON conversations;
CREATE POLICY "anon_delete_conversations" ON conversations FOR DELETE
TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON messages TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON messages TO service_role;

DROP POLICY IF EXISTS "anon_select_messages" ON messages;
CREATE POLICY "anon_select_messages" ON messages FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_messages" ON messages;
CREATE POLICY "anon_insert_messages" ON messages FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_messages" ON messages;
CREATE POLICY "anon_update_messages" ON messages FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_messages" ON messages;
CREATE POLICY "anon_delete_messages" ON messages FOR DELETE
TO anon, authenticated USING (true);
