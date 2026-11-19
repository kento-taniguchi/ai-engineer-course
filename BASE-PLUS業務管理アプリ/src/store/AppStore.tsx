"use client";

// アプリ全体のデータを管理し、変更があるたびにブラウザ内へ保存します。

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AppData } from "@/lib/types";
import { DATA_VERSION, createDemoData } from "@/lib/demoData";
import { ensureTodos } from "@/lib/todoEngine";
import { migrate } from "@/lib/migrate";
import { MINUTE } from "@/lib/time";
import { localStorageAdapter, type StorageAdapter } from "@/services/storage";
import { clearAllMedia } from "@/services/mediaStore";

interface Toast {
  id: number;
  message: string;
  tone: "ok" | "info" | "error";
}

interface AppStoreValue {
  data: AppData;
  /** 現在時刻（デモ用の時刻ずらしを反映済み） */
  now: Date;
  update: (fn: (d: AppData, now: Date) => AppData, message?: string) => void;
  notify: (message: string, tone?: Toast["tone"]) => void;
  resetDemo: () => void;
  /**
   * 書き出したファイル・クラウドから復元（既定では今のデータを別の場所に退避してから置き換える）。
   * 自動同期の読み込みでは backup=false・message=null（通知は自動同期側で出す）
   */
  replaceData: (d: AppData, opts?: { backup?: boolean; message?: string | null }) => void;
  storage: { label: string; bytes: number; error?: string };
}

const Ctx = createContext<AppStoreValue | null>(null);

const adapter: StorageAdapter = localStorageAdapter;

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [storage, setStorage] = useState<AppStoreValue["storage"]>({ label: adapter.label, bytes: 0 });
  const toastId = useRef(0);

  const offsetMin = data?.settings.clockOffsetMin ?? 0;
  const now = useMemo(() => new Date(tick + offsetMin * MINUTE), [tick, offsetMin]);

  // 初回読み込み
  useEffect(() => {
    const realNow = new Date();
    let loaded = adapter.load();
    if (!loaded) {
      loaded = createDemoData(realNow);
    } else if (!(loaded.version >= DATA_VERSION)) {
      // 古い形の保存データは、念のためバックアップを残してから新しい形へ移行（データは消さない）
      adapter.backup?.(loaded);
      loaded = migrate(loaded).data;
    }
    const off = loaded.settings?.clockOffsetMin ?? 0;
    setData(ensureTodos(loaded, new Date(realNow.getTime() + off * MINUTE)));
  }, []);

  // 時刻を30秒ごとに更新（日付が変わってもToDoは消えず、未完了は期限切れ側に移動）
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  // 保存
  useEffect(() => {
    if (!data) return;
    const res = adapter.save(data);
    setStorage(res.ok ? { label: adapter.label, bytes: res.bytes } : { label: adapter.label, bytes: 0, error: res.error });
  }, [data]);

  const notify = useCallback((message: string, tone: Toast["tone"] = "ok") => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((ts) => [...ts.slice(-2), { id, message, tone }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 3200);
  }, []);

  const update = useCallback<AppStoreValue["update"]>(
    (fn, message) => {
      setData((d) => {
        if (!d) return d;
        const off = d.settings.clockOffsetMin;
        const n = new Date(Date.now() + off * MINUTE);
        return ensureTodos(fn(d, n), n);
      });
      if (message) notify(message);
    },
    [notify],
  );

  const resetDemo = useCallback(() => {
    adapter.clear();
    void clearAllMedia();
    setData(createDemoData(new Date()));
    notify("デモデータを初期状態に戻しました");
  }, [notify]);

  const replaceData = useCallback<AppStoreValue["replaceData"]>(
    (d, opts) => {
      const backup = opts?.backup ?? true;
      setData((cur) => {
        // 読み込み前のデータを退避（キー：baseplus-backup-v＋版番号）
        if (cur && backup) adapter.backup?.(cur);
        const migrated = !(d.version >= DATA_VERSION) ? migrate(d).data : d;
        const off = cur?.settings.clockOffsetMin ?? 0;
        return ensureTodos(migrated, new Date(Date.now() + off * MINUTE));
      });
      const message = opts?.message === undefined ? "データを読み込みました（読み込み前のデータは同じブラウザ内に退避しました）" : opts.message;
      if (message) notify(message);
    },
    [notify],
  );

  if (!data) {
    return (
      <div className="loading" role="status">
        読み込み中…
      </div>
    );
  }

  return (
    <Ctx.Provider value={{ data, now, update, notify, resetDemo, replaceData, storage }}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`} role={t.tone === "error" ? "alert" : "status"}>
            <span aria-hidden="true">{t.tone === "error" ? "⚠" : t.tone === "info" ? "ℹ" : "✓"}</span> {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useApp(): AppStoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp は AppStoreProvider の内側で使ってください");
  return v;
}
