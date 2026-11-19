-- =====================================================================
-- BASE-PLUS業務管理アプリ：クラウド保存（Supabase）の初期設定
-- =====================================================================
-- 使い方：Supabaseのダッシュボード →「SQL Editor」に全文を貼り付けて「Run」。
--         何度実行しても同じ状態になるように書いてあります。
-- 前提  ：docs/データ共有の設計.md の手順で、プロジェクト作成とGoogleログインの設定を済ませていること。
--
-- 守りたいこと
--  1. 許可したメールアドレス（谷口さん本人）でログインした人だけが、自分のデータを読み書きできる
--  2. ログインしていない人・許可されていない人は、1件も読めない（画面ではなくデータベース側で拒否）
--  3. 上書き事故の防止：保存は save_app_state 関数だけ。版番号が違えば保存しない（他の端末の変更を消さない）
--  4. 保存のたびに直前のデータを控え（履歴）として残す（1時間に1回まで・最大500件）
--  5. 写真・動画は非公開の保存場所。本人のフォルダの中だけ読み書きでき、表示は期限付きURLのみ
-- =====================================================================

-- ---------- 1. 利用を許可するユーザー ----------
create table if not exists public.allowed_users (
  email text primary key,
  note  text,
  created_at timestamptz not null default now()
);
alter table public.allowed_users enable row level security;
-- ポリシーを作らない＝アプリ（ブラウザ）からは読み書きできない。登録はこのSQL Editorからのみ。
revoke all on public.allowed_users from anon, authenticated;

-- ログイン中の人が許可されたユーザーか
create or replace function public.is_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.allowed_users a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_allowed() from public, anon;
grant execute on function public.is_allowed() to authenticated;

-- ---------- 2. アプリのデータ（1人1件の文書） ----------
create table if not exists public.app_state (
  owner             uuid primary key references auth.users (id) on delete cascade,
  data              jsonb not null,
  data_version      int not null,
  revision          bigint not null,
  updated_at        timestamptz not null default now(),
  updated_by_device text
);
alter table public.app_state enable row level security;
revoke all on public.app_state from anon;
revoke insert, update, delete on public.app_state from authenticated;  -- 書き込みは関数経由のみ
grant select on public.app_state to authenticated;

drop policy if exists "本人のみ読める" on public.app_state;
create policy "本人のみ読める" on public.app_state
  for select to authenticated
  using (owner = (select auth.uid()) and (select public.is_allowed()));

-- ---------- 3. 保存の控え（履歴） ----------
create table if not exists public.app_state_history (
  id       bigint generated always as identity primary key,
  owner    uuid not null references auth.users (id) on delete cascade,
  revision bigint not null,
  data     jsonb not null,
  saved_at timestamptz not null default now(),
  device   text,
  reason   text
);
create index if not exists app_state_history_owner_idx on public.app_state_history (owner, id desc);
alter table public.app_state_history enable row level security;
revoke all on public.app_state_history from anon;
revoke insert, update, delete on public.app_state_history from authenticated;
grant select on public.app_state_history to authenticated;

drop policy if exists "本人のみ読める" on public.app_state_history;
create policy "本人のみ読める" on public.app_state_history
  for select to authenticated
  using (owner = (select auth.uid()) and (select public.is_allowed()));

-- ---------- 4. 保存（版番号を確認してから） ----------
-- 戻り値：ok=true なら保存済み（revision=新しい版番号）
--         ok=false なら他の端末が先に保存していた（remote_revision=クラウドの版番号）。何も変更しない。
create or replace function public.save_app_state(p_data jsonb, p_base_revision bigint, p_device text default null)
returns table (ok boolean, revision bigint, remote_revision bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_cur bigint;
  v_last_hist timestamptz;
begin
  if v_uid is null or not public.is_allowed() then
    raise exception '許可されていないユーザーです' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or not (p_data ? 'players') or not (p_data ? 'bookings') then
    raise exception 'データの形が正しくありません' using errcode = '22023';
  end if;
  if pg_column_size(p_data) > 20 * 1024 * 1024 then
    raise exception 'データが大きすぎます（20MBまで）' using errcode = '54000';
  end if;

  select s.revision into v_cur from public.app_state s where s.owner = v_uid for update;

  if v_cur is null then
    if p_base_revision <> 0 then
      return query select false, null::bigint, 0::bigint;
      return;
    end if;
    insert into public.app_state (owner, data, data_version, revision, updated_by_device)
    values (v_uid, p_data, coalesce((p_data ->> 'version')::int, 0), 1, p_device);
    insert into public.app_state_history (owner, revision, data, device, reason)
    values (v_uid, 1, p_data, p_device, '最初のアップロード');
    return query select true, 1::bigint, 1::bigint;
    return;
  end if;

  if v_cur <> p_base_revision then
    return query select false, null::bigint, v_cur;
    return;
  end if;

  -- 変更前のデータを控えに残す（1時間に1回まで）
  select max(h.saved_at) into v_last_hist from public.app_state_history h where h.owner = v_uid;
  if v_last_hist is null or v_last_hist < now() - interval '1 hour' then
    insert into public.app_state_history (owner, revision, data, device, reason)
    select s.owner, s.revision, s.data, s.updated_by_device, '自動の控え'
    from public.app_state s where s.owner = v_uid;
    delete from public.app_state_history h
    where h.owner = v_uid
      and h.id not in (select h2.id from public.app_state_history h2 where h2.owner = v_uid order by h2.id desc limit 500);
  end if;

  update public.app_state s
  set data = p_data,
      data_version = coalesce((p_data ->> 'version')::int, s.data_version),
      revision = v_cur + 1,
      updated_at = now(),
      updated_by_device = p_device
  where s.owner = v_uid;

  return query select true, v_cur + 1, v_cur + 1;
end;
$$;
revoke all on function public.save_app_state(jsonb, bigint, text) from public, anon;
grant execute on function public.save_app_state(jsonb, bigint, text) to authenticated;

-- ---------- 5. 写真・動画（非公開の保存場所） ----------
-- 無料プランは1ファイル50MBまで。動画を多く扱う場合は有料プランで上限を上げる。
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 52428800)
on conflict (id) do update set public = false;

-- 保存場所は「ユーザーID/ファイル名」。自分のフォルダだけ読み書きできる。
drop policy if exists "media 本人のみ読む" on storage.objects;
create policy "media 本人のみ読む" on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_allowed()));

drop policy if exists "media 本人のみ追加" on storage.objects;
create policy "media 本人のみ追加" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_allowed()));

drop policy if exists "media 本人のみ更新" on storage.objects;
create policy "media 本人のみ更新" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_allowed()))
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_allowed()));

drop policy if exists "media 本人のみ削除" on storage.objects;
create policy "media 本人のみ削除" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_allowed()));

-- =====================================================================
-- 最後に、本人のメールアドレスを1件だけ登録します（下の行の ' ' の中を書き換えて実行）。
-- ※ このファイルにメールアドレスを書いて保存・共有しないでください。SQL Editor上でだけ書き換えます。
--
--   insert into public.allowed_users (email, note) values ('ここに本人のGmailアドレス', '谷口さん本人');
--
-- 確認用（ログインしていない状態では0件になることを確認）：
--   select count(*) from public.app_state;   -- SQL Editorは管理者権限のため全件見えます。アプリ側の確認は設計書の手順で。
-- =====================================================================
