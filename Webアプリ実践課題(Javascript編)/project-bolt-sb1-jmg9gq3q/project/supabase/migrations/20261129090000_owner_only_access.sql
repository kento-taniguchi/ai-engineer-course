/*
  # 持ち主だけがデータを読み書きできるようにする

  1. app_owners … このアプリを使ってよい人（ユーザーID）。画面からは見えない
  2. app_access() … ログインした人が持ち主か調べる。
     持ち主がまだ1人もいなければ、最初に呼んだ人（最初にログインした人）を持ち主にする
  3. todos / task_templates / recurring_tasks / task_categories の決まりを、
     「だれでも」から「ログインした持ち主だけ」に入れ替える
  4. report_todos(token) … 毎朝・毎晩の LINE 通知用。合言葉が合うときだけタスクを返す
     （合言葉は private.report_tokens に入れる。画面や API からは見えない）
*/

-- 1. 持ち主の一覧
CREATE TABLE IF NOT EXISTS app_owners (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_owners ENABLE ROW LEVEL SECURITY;
-- 決まり（ポリシー）を作らないので、画面や API からは読み書きできない

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM app_owners WHERE user_id = auth.uid());
$$;

-- 2. 持ち主か調べる（まだ誰もいなければ、この人を持ち主にする）
CREATE OR REPLACE FUNCTION public.app_access()
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 'denied';
  END IF;
  IF EXISTS (SELECT 1 FROM app_owners WHERE user_id = auth.uid()) THEN
    RETURN 'owner';
  END IF;
  -- 同時に2人が来ても、持ち主が2人にならないようにする
  LOCK TABLE app_owners IN EXCLUSIVE MODE;
  IF NOT EXISTS (SELECT 1 FROM app_owners) THEN
    INSERT INTO app_owners (user_id) VALUES (auth.uid());
    RETURN 'owner';
  END IF;
  RETURN 'denied';
END;
$$;

REVOKE ALL ON FUNCTION public.is_owner() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_access() TO authenticated;

-- 3. 今までの「だれでも読み書きできる」決まりを全部消して、持ち主だけの決まりにする
DO $$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['todos', 'task_templates', 'recurring_tasks', 'task_categories'] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner())',
      'owner_all_' || t, t
    );
  END LOOP;
END;
$$;

-- 4. LINE 通知用：合言葉を知っているときだけ、タスクを読める
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS private.report_tokens (
  token text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.report_todos(p_token text)
RETURNS SETOF public.todos
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 OR NOT EXISTS (SELECT 1 FROM private.report_tokens WHERE token = p_token) THEN
    RAISE EXCEPTION 'invalid token' USING ERRCODE = '28000';
  END IF;
  RETURN QUERY SELECT * FROM public.todos ORDER BY created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.report_todos(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_todos(text) TO anon;

NOTIFY pgrst, 'reload schema';
