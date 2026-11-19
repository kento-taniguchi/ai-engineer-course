// クラウド保存（PC・iPhone間のデータ共有）の窓口。
//
// 現在：未設定（クラウドには一切送信しない）。
// 予定：Supabase（ログイン＝Googleアカウント、データベース＝PostgreSQL＋行レベルセキュリティ、
//       画像・動画＝非公開のStorage）。設計は docs/データ共有の設計.md、データベースの設定は supabase/schema.sql。
//
// Supabaseのプロジェクトを作成し、本人だけがログインできることを架空データで確認した後に、
// この CloudStore を実装したもの（SupabaseCloudStore）に差し替える。画面側は CloudStore だけを使う。
//
// 設定値（.env.local）:
//   NEXT_PUBLIC_SUPABASE_URL              … プロジェクトのURL（公開される値）
//   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  … 公開用のキー（publishable / anon。ブラウザに出る前提の値で、
//                                           データの保護はデータベースのアクセス制御（RLS）で行う）
//   ※ service_role / secret キーは絶対にここに書かない（すべてのデータを読み書きできてしまうため）

import type { AppData } from "@/lib/types";

export interface CloudSession {
  userId: string;
  email: string;
}

export interface RemoteSnapshot {
  data: AppData;
  revision: number;
  updatedAt: string;
  updatedByDevice?: string;
}

export type CloudErrorKind = "not-configured" | "auth" | "forbidden" | "conflict" | "network" | "too-large" | "other";

export type CloudResult<T> = { ok: true; value: T } | { ok: false; kind: CloudErrorKind; message: string; remoteRevision?: number };

export interface CloudStore {
  readonly label: string;
  readonly configured: boolean;
  /** ログイン中の本人（いなければ null） */
  getSession(): Promise<CloudSession | null>;
  /** Googleアカウントでログイン（許可したメールアドレス以外はデータを読めない） */
  signIn(): Promise<CloudResult<void>>;
  signOut(): Promise<void>;
  /** クラウドの最新データ（まだ無ければ null） */
  pull(): Promise<CloudResult<RemoteSnapshot | null>>;
  /** 版番号を確認して保存。別の端末が先に保存していたら conflict（上書きしない） */
  push(data: AppData, baseRevision: number, deviceLabel: string): Promise<CloudResult<{ revision: number }>>;
  /** 保存履歴（自動の控え）の一覧と取り出し */
  listHistory(): Promise<CloudResult<{ id: number; revision: number; savedAt: string; device?: string }[]>>;
  getHistory(id: number): Promise<CloudResult<AppData>>;
  /** 写真・動画（非公開）。取得は期限付きURLのみ */
  uploadMedia(path: string, blob: Blob): Promise<CloudResult<{ path: string; bytes: number }>>;
  signedMediaUrl(path: string, expiresSec: number): Promise<CloudResult<string>>;
  deleteMedia(path: string): Promise<CloudResult<void>>;
}

export function cloudConfig(): { configured: boolean; url: string | null } {
  // NEXT_PUBLIC_ の値はビルド時に埋め込まれるため、process.env.名前 の形で直接参照する
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  const okUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url.trim());
  // 秘密のキー（service_role / sb_secret_）が設定されていたら使わない
  const looksSecret = /^sb_secret_/.test(key) || /service_role/.test(decodeJwtRole(key) ?? "");
  return { configured: okUrl && key.length > 20 && !looksSecret, url: okUrl ? url.trim() : null };
}

function decodeJwtRole(key: string): string | null {
  const part = key.split(".")[1];
  if (!part) return null;
  try {
    return (JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

const NOT_CONFIGURED = { ok: false as const, kind: "not-configured" as const, message: "クラウド保存はまだ設定されていません（データはこのブラウザの中だけに保存されています）" };

/** 未設定のときの実装：何も送信しない */
export const notConfiguredCloud: CloudStore = {
  label: "未設定（クラウドには保存していません）",
  configured: false,
  getSession: async () => null,
  signIn: async () => NOT_CONFIGURED,
  signOut: async () => undefined,
  pull: async () => NOT_CONFIGURED,
  push: async () => NOT_CONFIGURED,
  listHistory: async () => NOT_CONFIGURED,
  getHistory: async () => NOT_CONFIGURED,
  uploadMedia: async () => NOT_CONFIGURED,
  signedMediaUrl: async () => NOT_CONFIGURED,
  deleteMedia: async () => NOT_CONFIGURED,
};

/** 本番で実在の選手情報を扱う前に必要なもの（設定画面に表示） */
export const PRODUCTION_READINESS: { item: string; status: "done" | "prepared" | "missing"; note: string }[] = [
  { item: "httpsでのアプリ公開", status: "done", note: "Vercel（無料のHobbyプラン・個人の非商用利用）で公開済み。検索エンジンには載せない設定。事業で使う場合は有料プランが必要" },
  { item: "本人だけのログイン", status: "prepared", note: "試験用プロジェクトでGoogleログインを実装（「クラウド保存」画面）。許可したメールアドレス以外はデータを読めない設定。本番用プロジェクトでの設定と、新規登録の停止が未了" },
  { item: "データベースのアクセス制御（RLS）", status: "prepared", note: "試験用プロジェクトに設定済み。未ログインでは読み書きできないことを確認済み。許可していない別アカウントでの確認が未了" },
  { item: "写真・動画の非公開保存", status: "prepared", note: "非公開の保存場所と期限付きURLの設計は準備済み。実装が未了" },
  { item: "PC・iPhone間の共有", status: "prepared", note: "自動同期（変更は数秒後に保存・画面に戻ると他の端末の変更を読み込む・両方で変更時だけ本人が選ぶ）で、PCとiPhoneの共有を架空データで確認済み。写真・動画の共有は未実装" },
  { item: "自動バックアップ", status: "prepared", note: "保存のたびの控え（1時間に1回まで）を設計済み。Supabaseの毎日の自動バックアップは有料プランのみ" },
  { item: "手動のバックアップ・復元（JSON）", status: "done", note: "設定画面で書き出し・戻すが可能（画像・動画は含まれない）" },
  { item: "保存失敗・接続エラーの表示", status: "prepared", note: "ブラウザ内保存・クラウド保存（通信・期限切れ・許可なし・競合・容量）の失敗表示を実装。実際の失敗時の表示は試験中" },
  { item: "保護者の同意・利用目的の説明", status: "missing", note: "記録・写真・動画の保存について同意を得る運用と、同意の記録欄が未整備" },
];
