// サーバー専用のSupabase接続（秘密の鍵を使う。画面側のコードから読み込まないこと）
//
// 使う環境変数（Vercelの画面で登録）
//   NEXT_PUBLIC_SUPABASE_URL  … プロジェクトのURL（公開される値）
//   SUPABASE_SECRET_KEY       … サーバー用の秘密の鍵（sb_secret_…）。アクセス制限を越えて読み書きできるため、絶対に画面側に出さない

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SeminarEpisode } from "@/lib/types";

let admin: SupabaseClient | null = null;

export function adminConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SECRET_KEY;
}

export function sbAdmin(): SupabaseClient {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) throw new Error("サーバー用のSupabaseの鍵が設定されていません");
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return admin;
}

/** アプリのデータから、プチセミナーの回だけを取り出す（利用者は本人1人の前提） */
export async function loadSeminars(): Promise<SeminarEpisode[]> {
  const { data, error } = await sbAdmin().from("app_state").select("seminars:data->seminars").limit(2);
  if (error) throw new Error(`アプリのデータを読み込めませんでした（${error.code ?? "不明"}）`);
  if (!data || data.length === 0) return [];
  if (data.length > 1) throw new Error("アプリのデータが複数あります（利用者は1人の前提です）");
  const s = (data[0] as { seminars?: unknown }).seminars;
  return Array.isArray(s) ? (s as SeminarEpisode[]) : [];
}

/**
 * 画面から呼ばれたとき、ログイン中の本人（許可したアカウント）かを確かめる。
 * Authorization: Bearer <ログインの通行証> を受け取り、Supabaseで本人確認してから許可リストと照合する。
 */
export async function requireOwner(req: Request): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { ok: false, status: 401, message: "ログインしていません" };
  const { data, error } = await sbAdmin().auth.getUser(token);
  const email = data.user?.email?.toLowerCase();
  if (error || !email) return { ok: false, status: 401, message: "ログインの有効期限が切れました。もう一度ログインしてください" };
  const { data: rows, error: e2 } = await sbAdmin().from("allowed_users").select("email");
  if (e2) return { ok: false, status: 500, message: "利用の許可を確認できませんでした" };
  const allowed = (rows ?? []).some((r) => (r.email as string).toLowerCase() === email);
  return allowed ? { ok: true } : { ok: false, status: 403, message: "このアカウントには利用の許可がありません" };
}
