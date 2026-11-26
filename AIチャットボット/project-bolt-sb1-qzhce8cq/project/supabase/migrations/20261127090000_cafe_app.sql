/*
  ひだまり珈琲店 AIアシスタント（ログイン・利用回数制限・在庫・予約・混雑状況・店主画面）

  すべての表・関数の名前に cafe_ を付けているので、
  ほかのアプリと同じSupabaseプロジェクトに置いてもぶつからない。

  - cafe_staff              店主（管理画面を使える人）。ゲスト以外で最初に名乗り出た1人
  - cafe_settings           店の設定（利用回数の上限・席数・営業時間・混雑状況）。1行だけ
  - cafe_products           商品と在庫。push=早く出したい（おすすめに出す）
  - cafe_conversations      会話（持ち主だけが読み書き。店主は閲覧のみ）
  - cafe_messages           メッセージ（同上）
  - cafe_reservations       予約（作成・取り消しは関数経由のみ）
  - cafe_reservation_items  予約と一緒の取り置き商品
  - cafe_usage              AIを使った記録（1日の回数制限に使う）
*/

-- ============ 店主 ============
CREATE TABLE IF NOT EXISTS public.cafe_staff (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cafe_staff ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.cafe_is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.cafe_staff WHERE user_id = auth.uid());
$$;

DROP POLICY IF EXISTS cafe_staff_select ON public.cafe_staff;
CREATE POLICY cafe_staff_select ON public.cafe_staff FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 店主がまだ決まっているか（ログイン画面などで使う）
CREATE OR REPLACE FUNCTION public.cafe_has_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.cafe_staff);
$$;

-- 最初の1人だけ店主になれる（ゲストは不可）
CREATE OR REPLACE FUNCTION public.cafe_claim_owner()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'ゲストのままでは店主として登録できません。Googleかメールでログインしてください。';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cafe_staff WHERE user_id = auth.uid()) THEN
    RETURN true;
  END IF;
  LOCK TABLE public.cafe_staff IN EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.cafe_staff) THEN
    RETURN false;
  END IF;
  INSERT INTO public.cafe_staff (user_id) VALUES (auth.uid());
  RETURN true;
END $$;

-- ============ 店の設定 ============
CREATE TABLE IF NOT EXISTS public.cafe_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  daily_user_limit int NOT NULL DEFAULT 30 CHECK (daily_user_limit >= 0),
  daily_total_limit int NOT NULL DEFAULT 500 CHECK (daily_total_limit >= 0),
  seats int NOT NULL DEFAULT 20 CHECK (seats > 0),
  reservable_seats int NOT NULL DEFAULT 12 CHECK (reservable_seats >= 0),
  max_party int NOT NULL DEFAULT 6 CHECK (max_party > 0),
  open_time time NOT NULL DEFAULT '08:00',
  close_time time NOT NULL DEFAULT '18:00',
  last_reservation_time time NOT NULL DEFAULT '16:30',
  stay_minutes int NOT NULL DEFAULT 90 CHECK (stay_minutes BETWEEN 15 AND 480),
  closed_weekdays int[] NOT NULL DEFAULT '{}', -- 0=日曜 … 6=土曜
  crowd_level text NOT NULL DEFAULT 'normal'
    CHECK (crowd_level IN ('empty', 'normal', 'busy', 'full', 'closed')),
  crowd_note text NOT NULL DEFAULT '',
  crowd_updated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.cafe_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.cafe_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cafe_settings_read ON public.cafe_settings;
CREATE POLICY cafe_settings_read ON public.cafe_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS cafe_settings_write ON public.cafe_settings;
CREATE POLICY cafe_settings_write ON public.cafe_settings FOR UPDATE TO authenticated
  USING (public.cafe_is_staff()) WITH CHECK (public.cafe_is_staff());

-- ============ 商品と在庫 ============
CREATE TABLE IF NOT EXISTS public.cafe_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_en text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'food'
    CHECK (category IN ('drink', 'food', 'sweets', 'beans', 'goods')),
  price int NOT NULL DEFAULT 0 CHECK (price >= 0),
  sale_price int CHECK (sale_price >= 0),
  stock int NOT NULL DEFAULT 0 CHECK (stock >= 0),
  best_before date,
  push boolean NOT NULL DEFAULT false,
  promo_text text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cafe_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cafe_products_read ON public.cafe_products;
CREATE POLICY cafe_products_read ON public.cafe_products FOR SELECT TO anon, authenticated
  USING (is_active OR public.cafe_is_staff());
DROP POLICY IF EXISTS cafe_products_insert ON public.cafe_products;
CREATE POLICY cafe_products_insert ON public.cafe_products FOR INSERT TO authenticated
  WITH CHECK (public.cafe_is_staff());
DROP POLICY IF EXISTS cafe_products_update ON public.cafe_products;
CREATE POLICY cafe_products_update ON public.cafe_products FOR UPDATE TO authenticated
  USING (public.cafe_is_staff()) WITH CHECK (public.cafe_is_staff());
DROP POLICY IF EXISTS cafe_products_delete ON public.cafe_products;
CREATE POLICY cafe_products_delete ON public.cafe_products FOR DELETE TO authenticated
  USING (public.cafe_is_staff());

-- 今おすすめしたい商品：「早く出したい」印、または賞味期限が明日まで。在庫があるものだけ
CREATE OR REPLACE FUNCTION public.cafe_recommendations()
RETURNS SETOF public.cafe_products LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.cafe_products
  WHERE is_active AND stock > 0
    AND (push OR (best_before IS NOT NULL
                  AND best_before <= ((now() AT TIME ZONE 'Asia/Tokyo')::date + 1)))
  ORDER BY best_before NULLS LAST, push DESC, updated_at DESC
  LIMIT 6;
$$;

-- ============ 会話とメッセージ ============
CREATE TABLE IF NOT EXISTS public.cafe_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  dify_conversation_id text,
  title text NOT NULL DEFAULT '新しいチャット',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cafe_conversations_user_idx ON public.cafe_conversations (user_id, updated_at DESC);
ALTER TABLE public.cafe_conversations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.cafe_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.cafe_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL DEFAULT '',
  dify_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cafe_messages_conv_idx ON public.cafe_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS cafe_messages_created_idx ON public.cafe_messages (created_at DESC);
ALTER TABLE public.cafe_messages ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cafe_conversations', 'cafe_messages'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t || '_own', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_staff_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.cafe_is_staff())',
      t || '_staff_read', t);
  END LOOP;
END $$;

-- ============ AIの利用回数 ============
CREATE TABLE IF NOT EXISTS public.cafe_usage (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cafe_usage_user_idx ON public.cafe_usage (user_id, created_at);
CREATE INDEX IF NOT EXISTS cafe_usage_created_idx ON public.cafe_usage (created_at);
ALTER TABLE public.cafe_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cafe_usage_staff_read ON public.cafe_usage;
CREATE POLICY cafe_usage_staff_read ON public.cafe_usage FOR SELECT TO authenticated
  USING (public.cafe_is_staff());

-- 日本時間の「今日の0時」
CREATE OR REPLACE FUNCTION public.cafe_today_start()
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT (date_trunc('day', now() AT TIME ZONE 'Asia/Tokyo')) AT TIME ZONE 'Asia/Tokyo';
$$;

-- 1回使う（上限を超えていたら使わずに理由を返す）
CREATE OR REPLACE FUNCTION public.cafe_consume_quota()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.cafe_settings;
  used_user int;
  used_total int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'login');
  END IF;
  SELECT * INTO s FROM public.cafe_settings WHERE id = 1;
  -- 同じ人の同時送信で数え間違えないよう、順番待ちにする
  PERFORM pg_advisory_xact_lock(hashtext('cafe_usage:' || auth.uid()::text));

  -- 店主は回数制限なし（テストしやすくするため）
  IF public.cafe_is_staff() THEN
    INSERT INTO public.cafe_usage (user_id) VALUES (auth.uid());
    RETURN jsonb_build_object('ok', true, 'remaining', null, 'limit', null);
  END IF;

  SELECT count(*) INTO used_total FROM public.cafe_usage WHERE created_at >= public.cafe_today_start();
  IF used_total >= s.daily_total_limit THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'total', 'remaining', 0, 'limit', s.daily_user_limit);
  END IF;

  SELECT count(*) INTO used_user FROM public.cafe_usage
    WHERE user_id = auth.uid() AND created_at >= public.cafe_today_start();
  IF used_user >= s.daily_user_limit THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user', 'remaining', 0, 'limit', s.daily_user_limit);
  END IF;

  INSERT INTO public.cafe_usage (user_id) VALUES (auth.uid());
  RETURN jsonb_build_object('ok', true, 'remaining', s.daily_user_limit - used_user - 1,
                            'limit', s.daily_user_limit);
END $$;

-- 今日の残り回数を見るだけ（使わない）
CREATE OR REPLACE FUNCTION public.cafe_quota_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.cafe_settings;
  used_user int;
BEGIN
  IF public.cafe_is_staff() THEN
    RETURN jsonb_build_object('remaining', null, 'limit', null);
  END IF;
  SELECT * INTO s FROM public.cafe_settings WHERE id = 1;
  SELECT count(*) INTO used_user FROM public.cafe_usage
    WHERE user_id = auth.uid() AND created_at >= public.cafe_today_start();
  RETURN jsonb_build_object('remaining', GREATEST(s.daily_user_limit - used_user, 0),
                            'limit', s.daily_user_limit);
END $$;

-- ============ 予約 ============
CREATE TABLE IF NOT EXISTS public.cafe_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  party_size int NOT NULL CHECK (party_size BETWEEN 1 AND 50),
  reserved_at timestamptz NOT NULL,
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked', 'visited', 'cancelled', 'no_show')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cafe_reservations_at_idx ON public.cafe_reservations (reserved_at);
CREATE INDEX IF NOT EXISTS cafe_reservations_user_idx ON public.cafe_reservations (user_id, reserved_at);
ALTER TABLE public.cafe_reservations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.cafe_reservation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.cafe_reservations(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.cafe_products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  qty int NOT NULL CHECK (qty > 0),
  unit_price int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS cafe_reservation_items_res_idx ON public.cafe_reservation_items (reservation_id);
ALTER TABLE public.cafe_reservation_items ENABLE ROW LEVEL SECURITY;

-- 読むのは本人か店主だけ。作成・変更は下の関数からのみ
DROP POLICY IF EXISTS cafe_reservations_read ON public.cafe_reservations;
CREATE POLICY cafe_reservations_read ON public.cafe_reservations FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.cafe_is_staff());
DROP POLICY IF EXISTS cafe_reservation_items_read ON public.cafe_reservation_items;
CREATE POLICY cafe_reservation_items_read ON public.cafe_reservation_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cafe_reservations r
                 WHERE r.id = reservation_id AND (r.user_id = auth.uid() OR public.cafe_is_staff())));

-- その時間帯にすでに入っている予約の人数
CREATE OR REPLACE FUNCTION public.cafe_booked_seats(p_at timestamptz)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(r.party_size), 0)::int
  FROM public.cafe_reservations r, public.cafe_settings s
  WHERE s.id = 1 AND r.status = 'booked'
    AND r.reserved_at > p_at - make_interval(mins => s.stay_minutes)
    AND r.reserved_at < p_at + make_interval(mins => s.stay_minutes);
$$;

-- 指定した日の、30分ごとの空き席数
CREATE OR REPLACE FUNCTION public.cafe_slot_availability(p_date date)
RETURNS TABLE (slot text, remaining int) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.cafe_settings;
  t time;
  at_ts timestamptz;
BEGIN
  SELECT * INTO s FROM public.cafe_settings WHERE id = 1;
  IF extract(dow FROM p_date)::int = ANY (s.closed_weekdays) THEN
    RETURN;
  END IF;
  t := s.open_time;
  WHILE t <= s.last_reservation_time LOOP
    at_ts := (p_date + t) AT TIME ZONE 'Asia/Tokyo';
    IF at_ts > now() + interval '30 minutes' THEN
      slot := to_char(t, 'HH24:MI');
      remaining := GREATEST(s.reservable_seats - public.cafe_booked_seats(at_ts), 0);
      RETURN NEXT;
    END IF;
    t := t + interval '30 minutes';
    EXIT WHEN t < s.open_time; -- 日付をまたいだら終わり
  END LOOP;
END $$;

-- 予約する（満席・営業時間・在庫を確かめ、取り置き分の在庫を引き当てる）
CREATE OR REPLACE FUNCTION public.cafe_create_reservation(
  p_name text, p_phone text, p_party int, p_at timestamptz, p_note text, p_items jsonb DEFAULT '[]'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.cafe_settings;
  local_ts timestamp;
  new_id uuid;
  item jsonb;
  prod public.cafe_products;
  q int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'login_required'; END IF;
  SELECT * INTO s FROM public.cafe_settings WHERE id = 1;
  local_ts := p_at AT TIME ZONE 'Asia/Tokyo';

  IF COALESCE(trim(p_name), '') = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  IF p_party < 1 OR p_party > s.max_party THEN RAISE EXCEPTION 'party_size'; END IF;
  IF p_at < now() + interval '30 minutes' OR p_at > now() + interval '60 days' THEN
    RAISE EXCEPTION 'out_of_range';
  END IF;
  IF extract(dow FROM local_ts)::int = ANY (s.closed_weekdays) THEN RAISE EXCEPTION 'closed_day'; END IF;
  IF local_ts::time < s.open_time OR local_ts::time > s.last_reservation_time THEN
    RAISE EXCEPTION 'out_of_hours';
  END IF;
  IF (SELECT count(*) FROM public.cafe_reservations
      WHERE user_id = auth.uid() AND status = 'booked' AND reserved_at > now()) >= 3 THEN
    RAISE EXCEPTION 'too_many';
  END IF;

  -- 同時に予約が入っても席数を超えないよう、順番待ちにする
  PERFORM pg_advisory_xact_lock(hashtext('cafe_reservation'));
  IF public.cafe_booked_seats(p_at) + p_party > s.reservable_seats THEN
    RAISE EXCEPTION 'full';
  END IF;

  INSERT INTO public.cafe_reservations (user_id, name, phone, party_size, reserved_at, note)
  VALUES (auth.uid(), left(trim(p_name), 50), left(COALESCE(p_phone, ''), 30), p_party, p_at,
          left(COALESCE(p_note, ''), 300))
  RETURNING id INTO new_id;

  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    q := (item ->> 'qty')::int;
    IF q IS NULL OR q < 1 OR q > 20 THEN RAISE EXCEPTION 'bad_qty'; END IF;
    SELECT * INTO prod FROM public.cafe_products
      WHERE id = (item ->> 'product_id')::uuid AND is_active FOR UPDATE;
    IF NOT FOUND OR prod.stock < q THEN RAISE EXCEPTION 'out_of_stock'; END IF;
    UPDATE public.cafe_products SET stock = stock - q, updated_at = now() WHERE id = prod.id;
    INSERT INTO public.cafe_reservation_items (reservation_id, product_id, product_name, qty, unit_price)
    VALUES (new_id, prod.id, prod.name, q, COALESCE(prod.sale_price, prod.price));
  END LOOP;

  RETURN new_id;
END $$;

-- 予約の状態を変える（お客さんは自分の予約の取り消しだけ。店主は何でも）
-- 取り消し・無断キャンセルになったら、取り置き分の在庫を戻す
CREATE OR REPLACE FUNCTION public.cafe_set_reservation_status(p_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.cafe_reservations;
BEGIN
  SELECT * INTO r FROM public.cafe_reservations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.cafe_is_staff() THEN
    IF r.user_id <> auth.uid() OR p_status <> 'cancelled' OR r.status <> 'booked' THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;
  IF p_status NOT IN ('booked', 'visited', 'cancelled', 'no_show') THEN RAISE EXCEPTION 'bad_status'; END IF;
  IF r.status = p_status THEN RETURN; END IF;

  -- 取り置き分を在庫に戻す／もう一度引き当てる
  IF r.status IN ('booked', 'visited') AND p_status IN ('cancelled', 'no_show') THEN
    UPDATE public.cafe_products p SET stock = p.stock + i.qty, updated_at = now()
      FROM public.cafe_reservation_items i WHERE i.reservation_id = p_id AND i.product_id = p.id;
  ELSIF r.status IN ('cancelled', 'no_show') AND p_status IN ('booked', 'visited') THEN
    UPDATE public.cafe_products p SET stock = GREATEST(p.stock - i.qty, 0), updated_at = now()
      FROM public.cafe_reservation_items i WHERE i.reservation_id = p_id AND i.product_id = p.id;
  END IF;

  UPDATE public.cafe_reservations SET status = p_status WHERE id = p_id;
END $$;

-- ============ 今のお店の様子（混雑・営業中か） ============
CREATE OR REPLACE FUNCTION public.cafe_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.cafe_settings;
  local_now timestamp := now() AT TIME ZONE 'Asia/Tokyo';
  open_now boolean;
  reserved_now int;
BEGIN
  SELECT * INTO s FROM public.cafe_settings WHERE id = 1;
  open_now := NOT (extract(dow FROM local_now)::int = ANY (s.closed_weekdays))
              AND local_now::time >= s.open_time AND local_now::time < s.close_time;
  SELECT COALESCE(SUM(party_size), 0) INTO reserved_now FROM public.cafe_reservations
    WHERE status IN ('booked', 'visited')
      AND reserved_at <= now() AND reserved_at > now() - make_interval(mins => s.stay_minutes);
  RETURN jsonb_build_object(
    'is_open', open_now,
    'open_time', to_char(s.open_time, 'HH24:MI'),
    'close_time', to_char(s.close_time, 'HH24:MI'),
    'closed_weekdays', s.closed_weekdays,
    'seats', s.seats,
    'reserved_now', reserved_now,
    'crowd_level', s.crowd_level,
    'crowd_note', s.crowd_note,
    'crowd_updated_at', s.crowd_updated_at,
    'max_party', s.max_party
  );
END $$;

-- ============ 権限 ============
GRANT SELECT ON public.cafe_settings, public.cafe_products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.cafe_conversations, public.cafe_messages, public.cafe_products TO authenticated;
GRANT SELECT, UPDATE ON public.cafe_settings TO authenticated;
GRANT SELECT ON public.cafe_staff, public.cafe_reservations, public.cafe_reservation_items,
  public.cafe_usage TO authenticated;

REVOKE ALL ON FUNCTION public.cafe_claim_owner() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cafe_consume_quota() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cafe_quota_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cafe_create_reservation(text, text, int, timestamptz, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cafe_set_reservation_status(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cafe_booked_seats(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cafe_is_staff() TO anon;
GRANT EXECUTE ON FUNCTION public.cafe_is_staff(), public.cafe_claim_owner(), public.cafe_consume_quota(),
  public.cafe_quota_status(), public.cafe_create_reservation(text, text, int, timestamptz, text, jsonb),
  public.cafe_set_reservation_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cafe_has_owner(), public.cafe_status(), public.cafe_recommendations(),
  public.cafe_slot_availability(date) TO anon, authenticated;

-- ============ 試しの商品（あとで管理画面から自由に変更・削除できる） ============
INSERT INTO public.cafe_products (name, name_en, category, price, sale_price, stock, best_before, push, promo_text)
SELECT * FROM (VALUES
  ('ひだまりブレンド', 'Hidamari Blend', 'drink', 500, NULL::int, 999, NULL::date, false, ''),
  ('カフェラテ', 'Caffè Latte', 'drink', 550, NULL::int, 999, NULL::date, false, ''),
  ('季節のスコーン', 'Seasonal Scone', 'sweets', 380, 300, 6,
    ((now() AT TIME ZONE 'Asia/Tokyo')::date), true, '本日焼き上げ・数量限定'),
  ('自家製バナナブレッド', 'Homemade Banana Bread', 'sweets', 420, NULL::int, 4,
    ((now() AT TIME ZONE 'Asia/Tokyo')::date + 1), false, 'しっとり食べ頃'),
  ('ハムとチーズのサンド', 'Ham & Cheese Sandwich', 'food', 650, 520, 3,
    ((now() AT TIME ZONE 'Asia/Tokyo')::date), true, 'ランチにどうぞ'),
  ('コーヒー豆 200g（深煎り）', 'Coffee Beans 200g (Dark Roast)', 'beans', 1400, NULL::int, 12, NULL::date, false, '')
) AS v(name, name_en, category, price, sale_price, stock, best_before, push, promo_text)
WHERE NOT EXISTS (SELECT 1 FROM public.cafe_products);
