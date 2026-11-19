-- =====================================================================
-- BASE-PLUS業務管理アプリ：公式LINEの自動返信・配信日の一斉送信（追加の設定）
-- =====================================================================
-- 使い方：Supabaseの「SQL Editor」に全文を貼り付けて「Run」。何度実行しても同じ状態になります。
-- 前提  ：supabase/schema.sql を実行済みであること（is_allowed 関数を使います）。
--
-- 記録するもの（必要最小限）
--  - 「セミナー」と送ってきた人の LINE の識別番号（userId）と、申込・停止の日時だけ。名前・プロフィールは保存しない
--  - 配信した回・日時・送信人数（同じ回を二重に送らないため）
--
-- 誰が読み書きできるか
--  - 書き込み：サーバー（Vercel）だけ。サーバー用の秘密の鍵で行う。ブラウザからは書けない
--  - 読み取り：申込者の一覧はブラウザからは読めない（人数だけを is_allowed の本人に返す関数を用意）
--             配信の記録は、許可した本人だけが読める
-- =====================================================================

-- ---------- 申込者 ----------
create table if not exists public.line_subscribers (
  line_user_id      text primary key,
  status            text not null default 'active' check (status in ('active', 'stopped', 'blocked')),
  subscribed_at     timestamptz not null default now(),
  last_request_at   timestamptz,
  status_changed_at timestamptz not null default now()
);
alter table public.line_subscribers enable row level security;
revoke all on public.line_subscribers from anon, authenticated;

-- 人数だけを返す（識別番号は返さない）
create or replace function public.line_subscriber_stats()
returns table (active bigint, stopped bigint, blocked bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*) filter (where s.status = 'active'),
    count(*) filter (where s.status = 'stopped'),
    count(*) filter (where s.status = 'blocked')
  from public.line_subscribers s
  where public.is_allowed();
$$;
revoke all on function public.line_subscriber_stats() from public, anon;
grant execute on function public.line_subscriber_stats() to authenticated;

-- ---------- 配信の記録（回ごとに1件。二重送信の防止） ----------
create table if not exists public.line_deliveries (
  episode_id  text primary key,
  status      text not null check (status in ('sending', 'sent', 'failed')),
  trigger     text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  recipients  int,
  error       text
);
alter table public.line_deliveries enable row level security;
revoke all on public.line_deliveries from anon;
revoke insert, update, delete on public.line_deliveries from authenticated;
grant select on public.line_deliveries to authenticated;

drop policy if exists "本人のみ読める" on public.line_deliveries;
create policy "本人のみ読める" on public.line_deliveries
  for select to authenticated
  using ((select public.is_allowed()));

-- 配信を始めてよいか確認して「送信中」にする（サーバー専用）。
-- まだ送っていない回、または前回失敗した回だけ true。送信済み・送信中なら false（二重送信しない）
create or replace function public.claim_line_delivery(p_episode_id text, p_trigger text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean := false;
begin
  insert into public.line_deliveries as d (episode_id, status, trigger, started_at)
  values (p_episode_id, 'sending', p_trigger, now())
  on conflict (episode_id) do update
    set status = 'sending', trigger = excluded.trigger, started_at = now(), finished_at = null, error = null
    where d.status = 'failed'
       or (d.status = 'sending' and d.started_at < now() - interval '15 minutes')  -- 途中で止まった送信のやり直し
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;
revoke all on function public.claim_line_delivery(text, text) from public, anon, authenticated;
grant execute on function public.claim_line_delivery(text, text) to service_role;
