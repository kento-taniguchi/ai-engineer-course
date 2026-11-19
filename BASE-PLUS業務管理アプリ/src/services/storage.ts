// データの保存先。試作版はブラウザ内（localStorage）に保存します。
// 将来クラウドのデータベースへ移行する場合は、同じ形の StorageAdapter を作って差し替えます。

import type { AppData } from "@/lib/types";

export interface StorageAdapter {
  readonly label: string;
  load(): AppData | null;
  save(data: AppData): { ok: true; bytes: number } | { ok: false; error: string };
  clear(): void;
  /** 移行前のデータを別の場所に退避 */
  backup?(data: AppData): void;
}

const KEY = "baseplus-demo-data-v1";
/** localStorage の容量はブラウザによって約5MB。余裕を持って警告ラインを設定 */
export const STORAGE_WARN_BYTES = 3 * 1024 * 1024;

export const localStorageAdapter: StorageAdapter = {
  label: "このブラウザ内（localStorage）",
  load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw) as AppData;
    } catch {
      return null;
    }
  },
  save(data) {
    try {
      const raw = JSON.stringify(data);
      window.localStorage.setItem(KEY, raw);
      return { ok: true, bytes: new Blob([raw]).size };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "保存に失敗しました" };
    }
  },
  backup(data) {
    try {
      window.localStorage.setItem(`baseplus-backup-v${data.version ?? 1}`, JSON.stringify(data));
    } catch {
      /* 容量不足などでバックアップできなくても、移行自体は続ける */
    }
  },
  clear() {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* 何もしない */
    }
  },
};
