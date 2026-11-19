// Supabase を使ったクラウド保存（CloudStore の実装）。
//
// - ログイン：Googleアカウント（Supabase Auth）。ログイン情報はSupabaseのライブラリがこのブラウザに保存する
// - データ：app_state（1人1件の文書）。保存は save_app_state 関数だけ（版番号の確認つき）
// - 誰が読めるか：データベース側で「許可したメールアドレスの本人だけ」に制限（supabase/schema.sql）
// - 使う設定値は公開用のURLとキーだけ。秘密のキー（service_role / secret）は使わない

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppData } from "@/lib/types";
import { validateAppDataShape } from "@/lib/cloudSync";
import { cloudConfig, type CloudErrorKind, type CloudResult, type CloudSession, type CloudStore, type RemoteSnapshot } from "./cloudStore";

let client: SupabaseClient | null = null;

function sb(): SupabaseClient {
  if (client) return client;
  const { configured, url } = cloudConfig();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (!configured || !url) throw new Error("クラウド保存が設定されていません");
  client = createClient(url, key.trim(), {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
  });
  return client;
}

function fail<T>(kind: CloudErrorKind, message: string, extra: { remoteRevision?: number } = {}): CloudResult<T> {
  return { ok: false, kind, message, ...extra };
}

/** Supabase・通信のエラーを、画面に出す分かりやすい文に変える（内容・キーは含めない） */
function mapError<T>(e: unknown, what: string): CloudResult<T> {
  const err = e as { code?: string; message?: string; status?: number; name?: string } | null;
  const code = err?.code ?? "";
  const msg = err?.message ?? "";
  if (err?.name === "TypeError" || /Failed to fetch|NetworkError|Load failed|fetch failed/i.test(msg)) {
    return fail("network", `${what}：インターネットに接続できませんでした（この端末には保存されています）`);
  }
  if (code === "42501" || /permission denied|許可されていない/i.test(msg)) {
    return fail("forbidden", `${what}：このアカウントには利用の許可がありません（許可したGoogleアカウントでログインしてください）`);
  }
  if (code === "PGRST301" || code === "PGRST303" || err?.status === 401 || /JWT|token/i.test(msg)) {
    return fail("auth", `${what}：ログインの有効期限が切れました。もう一度ログインしてください`);
  }
  if (code === "54000" || /大きすぎ|too large|Payload/i.test(msg)) {
    return fail("too-large", `${what}：データが大きすぎて保存できませんでした`);
  }
  return fail("other", `${what}に失敗しました${code ? `（${code}）` : ""}`);
}

async function requireSession(): Promise<CloudSession | null> {
  const { data } = await sb().auth.getSession();
  const u = data.session?.user;
  return u ? { userId: u.id, email: u.email ?? "" } : null;
}

export const supabaseCloudStore: CloudStore & { isAllowed(): Promise<CloudResult<boolean>> } = {
  label: "クラウド（Supabase）",
  configured: true,

  async getSession() {
    try {
      return await requireSession();
    } catch {
      return null;
    }
  },

  async signIn() {
    try {
      const { error } = await sb().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/cloud`, queryParams: { prompt: "select_account" } },
      });
      if (error) return mapError(error, "ログイン");
      return { ok: true, value: undefined };
    } catch (e) {
      return mapError(e, "ログイン");
    }
  },

  async signOut() {
    try {
      await sb().auth.signOut();
    } catch {
      /* ログアウトに失敗しても画面上は未ログインとして扱う */
    }
  },

  /** ログイン中のアカウントが利用を許可されているか（データベースの is_allowed 関数で確認） */
  async isAllowed() {
    try {
      const { data, error } = await sb().rpc("is_allowed");
      if (error) return mapError(error, "利用の許可の確認");
      return { ok: true, value: data === true };
    } catch (e) {
      return mapError(e, "利用の許可の確認");
    }
  },

  async pull() {
    try {
      if (!(await requireSession())) return fail("auth", "ログインしていません");
      const { data, error } = await sb().from("app_state").select("data, revision, updated_at, updated_by_device").maybeSingle();
      if (error) return mapError(error, "クラウドからの読み込み");
      if (!data) return { ok: true, value: null };
      const v = validateAppDataShape(data.data);
      if (!v.ok) return fail("other", `クラウドのデータを読み込めませんでした：${v.error}`);
      const snap: RemoteSnapshot = { data: v.data, revision: Number(data.revision), updatedAt: data.updated_at, updatedByDevice: data.updated_by_device ?? undefined };
      return { ok: true, value: snap };
    } catch (e) {
      return mapError(e, "クラウドからの読み込み");
    }
  },

  async push(data: AppData, baseRevision: number, deviceLabel: string) {
    try {
      if (!(await requireSession())) return fail("auth", "ログインしていません");
      const { data: rows, error } = await sb().rpc("save_app_state", { p_data: data, p_base_revision: baseRevision, p_device: deviceLabel });
      if (error) return mapError(error, "クラウドへの保存");
      const r = (Array.isArray(rows) ? rows[0] : rows) as { ok: boolean; revision: number | null; remote_revision: number | null } | undefined;
      if (!r) return fail("other", "クラウドへの保存の結果を確認できませんでした");
      if (!r.ok) {
        return fail("conflict", "他の端末で先に保存されています。上書きはしていません（クラウドの内容を確認してください）", { remoteRevision: Number(r.remote_revision ?? 0) });
      }
      return { ok: true, value: { revision: Number(r.revision) } };
    } catch (e) {
      return mapError(e, "クラウドへの保存");
    }
  },

  async listHistory() {
    try {
      const { data, error } = await sb().from("app_state_history").select("id, revision, saved_at, device").order("id", { ascending: false }).limit(50);
      if (error) return mapError(error, "保存履歴の読み込み");
      return { ok: true, value: (data ?? []).map((h) => ({ id: Number(h.id), revision: Number(h.revision), savedAt: h.saved_at as string, device: (h.device as string | null) ?? undefined })) };
    } catch (e) {
      return mapError(e, "保存履歴の読み込み");
    }
  },

  async getHistory(id: number) {
    try {
      const { data, error } = await sb().from("app_state_history").select("data").eq("id", id).maybeSingle();
      if (error) return mapError(error, "保存履歴の取り出し");
      if (!data) return fail("other", "保存履歴が見つかりません");
      const v = validateAppDataShape(data.data);
      if (!v.ok) return fail("other", v.error);
      return { ok: true, value: v.data };
    } catch (e) {
      return mapError(e, "保存履歴の取り出し");
    }
  },

  async uploadMedia(path: string, blob: Blob) {
    try {
      const { error } = await sb().storage.from("media").upload(path, blob, { upsert: true, contentType: blob.type || "application/octet-stream" });
      if (error) return mapError(error, "ファイルのアップロード");
      return { ok: true, value: { path, bytes: blob.size } };
    } catch (e) {
      return mapError(e, "ファイルのアップロード");
    }
  },

  async signedMediaUrl(path: string, expiresSec: number) {
    try {
      const { data, error } = await sb().storage.from("media").createSignedUrl(path, expiresSec);
      if (error || !data) return mapError(error, "ファイルの表示");
      return { ok: true, value: data.signedUrl };
    } catch (e) {
      return mapError(e, "ファイルの表示");
    }
  },

  async deleteMedia(path: string) {
    try {
      const { error } = await sb().storage.from("media").remove([path]);
      if (error) return mapError(error, "ファイルの削除");
      return { ok: true, value: undefined };
    } catch (e) {
      return mapError(e, "ファイルの削除");
    }
  },
};
