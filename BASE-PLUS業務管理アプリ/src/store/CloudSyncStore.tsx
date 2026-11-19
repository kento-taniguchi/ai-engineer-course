"use client";

// 自動同期：変更を数秒後にクラウドへ保存し、アプリを開いたとき・画面に戻ったときに他の端末の変更を読み込む。
//
// 安全のための決まり
//  - 保存は版番号つき。他の端末が先に保存していたら上書きせず「要確認」にする（本人が選ぶ）
//  - 他の端末の変更を読み込むのは、この端末にクラウドへ未保存の変更がないときだけ
//  - この端末がまだクラウドとつながっていない（最初の選択をしていない）ときは何もしない（「クラウド保存」画面で選ぶ）
//  - 通信できないときはこの端末に保存したまま待ち、つながったら送る

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "./AppStore";
import { cloudConfig, type CloudResult, type RemoteSnapshot } from "@/services/cloudStore";
import { supabaseCloudStore as cloud } from "@/services/supabaseCloudStore";
import { deviceLabel, downloadJson, loadAutoSync, loadMeta, saveAutoSync, saveMeta, type CloudMeta } from "@/services/cloudMeta";
import { dataFingerprint, decideAutoSync, mergeDeviceSettings, prepareForCloud, summarizeData, type DataSummary } from "@/lib/cloudSync";
import { toISO } from "@/lib/time";

export type SyncState =
  | "not-configured"
  | "checking"
  | "signed-out"
  | "not-allowed"
  | "setup"
  | "synced"
  | "saving"
  | "offline"
  | "conflict"
  | "paused"
  | "error";

export interface ConflictInfo {
  local: DataSummary;
  remote: DataSummary;
  remoteUpdatedAt: string;
  remoteDevice?: string;
}

interface CloudSyncValue {
  state: SyncState;
  message: string | null;
  lastSyncedAt: string | null;
  autoSync: boolean;
  conflict: ConflictInfo | null;
  setAutoSync: (on: boolean) => void;
  /** すぐに確認する（クラウドの変更の読み込み・未保存の変更の保存） */
  checkNow: () => void;
  /** 両方で変更があったときに、どちらを使うか選ぶ */
  resolveConflict: (use: "remote" | "local") => Promise<void>;
  /** 「クラウド保存」画面で手動の操作をしたあとに呼ぶ */
  refreshMeta: () => void;
}

const Ctx = createContext<CloudSyncValue | null>(null);

const SAVE_DELAY_MS = 2500;
const POLL_MS = 60 * 1000;
const MIN_CHECK_GAP_MS = 10 * 1000;

export function CloudSyncProvider({ children }: { children: ReactNode }) {
  const { data, replaceData, notify } = useApp();
  const configured = cloudConfig().configured;
  const [state, setState] = useState<SyncState>(configured ? "checking" : "not-configured");
  const [message, setMessage] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [autoSync, setAutoSyncState] = useState(true);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);

  const dataRef = useRef(data);
  const stateRef = useRef(state);
  const metaRef = useRef<CloudMeta | null>(null);
  const userRef = useRef<string | null>(null);
  const allowedRef = useRef<boolean | null>(null);
  const conflictRemoteRef = useRef<RemoteSnapshot | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCheckRef = useRef(0);
  const autoRef = useRef(true);

  dataRef.current = data;

  const set = useCallback((s: SyncState, msg: string | null = null) => {
    stateRef.current = s;
    setState(s);
    setMessage(msg);
  }, []);

  const remember = useCallback((revision: number, fingerprint: string) => {
    if (!userRef.current) return;
    const m: CloudMeta = { userId: userRef.current, revision, fingerprint, syncedAt: toISO(new Date()) };
    saveMeta(m);
    metaRef.current = m;
    setLastSyncedAt(m.syncedAt);
  }, []);

  /** 処理を1つずつ順番に行う（保存と読み込みが重ならないように） */
  const run = useCallback((fn: () => Promise<void>) => {
    chainRef.current = chainRef.current.then(fn).catch(() => undefined);
    return chainRef.current;
  }, []);

  const handleError = useCallback(
    (r: Extract<CloudResult<unknown>, { ok: false }>) => {
      if (r.kind === "network") set("offline", "インターネットに接続できません。この端末には保存されています（つながったら自動で送ります）");
      else if (r.kind === "auth") set("signed-out", "ログインの有効期限が切れました。「クラウド保存」画面でログインしてください");
      else if (r.kind === "forbidden") set("not-allowed", r.message);
      else set("error", r.message);
    },
    [set],
  );

  const applyRemote = useCallback(
    (remote: RemoteSnapshot, opts: { backup: boolean; message: string | null }) => {
      const merged = mergeDeviceSettings(remote.data, dataRef.current);
      replaceData(merged, opts);
      remember(remote.revision, dataFingerprint(merged));
    },
    [replaceData, remember],
  );

  const push = useCallback(
    async (base: number) => {
      set("saving");
      const current = dataRef.current;
      const payload = prepareForCloud(current);
      const fp = dataFingerprint(payload);
      const r = await cloud.push(payload, base, deviceLabel());
      if (r.ok) {
        remember(r.value.revision, fp);
        set("synced");
        // 保存中にさらに変更があれば、もう一度保存する
        if (dataFingerprint(dataRef.current) !== fp) scheduleSaveRef.current();
        return;
      }
      if (r.kind === "conflict") {
        const p = await cloud.pull();
        if (p.ok && p.value) {
          conflictRemoteRef.current = p.value;
          setConflict({ local: summarizeData(dataRef.current), remote: summarizeData(p.value.data), remoteUpdatedAt: p.value.updatedAt, remoteDevice: p.value.updatedByDevice });
          set("conflict", "この端末と他の端末の両方で変更がありました。どちらの内容を使うか選んでください");
          return;
        }
      }
      handleError(r);
    },
    [set, remember, handleError],
  );

  /** クラウドの状態を確認して、必要なら保存・読み込みを行う */
  const check = useCallback(
    (force = false) =>
      run(async () => {
        if (!configured) return;
        if (!force && Date.now() - lastCheckRef.current < MIN_CHECK_GAP_MS) return;
        lastCheckRef.current = Date.now();
        if (stateRef.current === "conflict") return; // 本人の選択を待つ
        const session = await cloud.getSession();
        if (!session) {
          userRef.current = null;
          allowedRef.current = null;
          set("signed-out");
          return;
        }
        if (userRef.current !== session.userId) {
          userRef.current = session.userId;
          allowedRef.current = null;
        }
        if (allowedRef.current === null) {
          const a = await cloud.isAllowed();
          if (!a.ok) return handleError(a);
          allowedRef.current = a.value;
        }
        if (!allowedRef.current) return set("not-allowed");
        metaRef.current = loadMeta(session.userId);
        setLastSyncedAt(metaRef.current?.syncedAt ?? null);
        if (!autoRef.current) return set("paused");
        const r = await cloud.pull();
        if (!r.ok) return handleError(r);
        const remote = r.value;
        const localFp = dataFingerprint(dataRef.current);
        const remoteFp = remote ? dataFingerprint(remote.data) : null;
        const action = decideAutoSync(metaRef.current, localFp, remote && remoteFp ? { revision: remote.revision, fingerprint: remoteFp } : null);
        switch (action) {
          case "none":
            return set("synced");
          case "adopt":
            remember(remote!.revision, localFp);
            return set("synced");
          case "push":
            return push(metaRef.current!.revision);
          case "pull":
            applyRemote(remote!, { backup: false, message: null });
            notify(`他の端末${remote!.updatedByDevice ? `（${remote!.updatedByDevice}）` : ""}の変更を読み込みました`, "info");
            return set("synced");
          case "conflict":
            conflictRemoteRef.current = remote;
            setConflict({ local: summarizeData(dataRef.current), remote: summarizeData(remote!.data), remoteUpdatedAt: remote!.updatedAt, remoteDevice: remote!.updatedByDevice });
            return set("conflict", "この端末と他の端末の両方で変更がありました。どちらの内容を使うか選んでください");
          case "setup":
            return set("setup", "この端末はまだクラウドとつながっていません。「クラウド保存」画面で、使うデータを選んでください");
        }
      }),
    [configured, run, set, handleError, remember, push, applyRemote, notify],
  );

  // 変更があったら、少し待ってから保存する（続けて操作している間はまとめる）
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void run(async () => {
        const s = stateRef.current;
        if (!autoRef.current || !metaRef.current || !(s === "synced" || s === "offline" || s === "saving" || s === "error")) return;
        if (dataFingerprint(dataRef.current) === metaRef.current.fingerprint) return;
        await push(metaRef.current.revision);
      });
    }, SAVE_DELAY_MS);
  }, [run, push]);
  const scheduleSaveRef = useRef(scheduleSave);
  scheduleSaveRef.current = scheduleSave;

  // 起動時
  useEffect(() => {
    if (!configured) return;
    const on = loadAutoSync();
    autoRef.current = on;
    setAutoSyncState(on);
    void check(true);
  }, [configured, check]);

  // データが変わったら保存を予約
  useEffect(() => {
    if (!configured) return;
    if (metaRef.current && autoRef.current) scheduleSave();
  }, [data, configured, scheduleSave]);

  // 画面に戻ったとき・ネットにつながったとき・一定時間ごとに確認。画面を離れるときは未保存分をすぐ送る
  useEffect(() => {
    if (!configured) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
      else if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        void run(async () => {
          if (metaRef.current && autoRef.current && stateRef.current !== "conflict" && dataFingerprint(dataRef.current) !== metaRef.current.fingerprint) await push(metaRef.current.revision);
        });
      }
    };
    const onFocus = () => void check();
    const onOnline = () => void check(true);
    const onOffline = () => set("offline", "インターネットに接続できません。この端末には保存されています（つながったら自動で送ります）");
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, POLL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(t);
    };
  }, [configured, check, run, push, set]);

  const setAutoSync = useCallback(
    (on: boolean) => {
      saveAutoSync(on);
      autoRef.current = on;
      setAutoSyncState(on);
      void check(true);
    },
    [check],
  );

  const resolveConflict = useCallback(
    async (use: "remote" | "local") => {
      const remote = conflictRemoteRef.current;
      if (!remote) return;
      await run(async () => {
        if (use === "remote") {
          applyRemote(remote, { backup: true, message: "クラウドの内容を読み込みました（この端末の内容は同じブラウザ内に退避しました）" });
          set("synced");
        } else {
          // 上書きで消えるクラウドの内容を、念のためファイルに残す
          downloadJson(remote.data, `baseplus-cloud-before-overwrite-v${remote.revision}.json`);
          await push(remote.revision);
          if (stateRef.current === "synced") notify("この端末の内容でクラウドを上書きしました（上書き前の内容はファイルに保存しました）");
        }
        conflictRemoteRef.current = null;
        if (stateRef.current !== "conflict") setConflict(null);
      });
    },
    [run, applyRemote, set, push, notify],
  );

  const refreshMeta = useCallback(() => {
    if (stateRef.current === "conflict") {
      conflictRemoteRef.current = null;
      setConflict(null);
      set("checking");
    }
    void check(true);
  }, [check, set]);

  const checkNow = useCallback(() => void check(true), [check]);

  return (
    <Ctx.Provider value={{ state, message, lastSyncedAt, autoSync, conflict, setAutoSync, checkNow, resolveConflict, refreshMeta }}>{children}</Ctx.Provider>
  );
}

export function useCloudSync(): CloudSyncValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCloudSync は CloudSyncProvider の内側で使ってください");
  return v;
}

export const SYNC_STATE_LABEL: Record<SyncState, string> = {
  "not-configured": "クラウド未設定",
  checking: "確認中…",
  "signed-out": "ログインが必要",
  "not-allowed": "利用の許可がないアカウント",
  setup: "最初の設定が必要",
  synced: "同期済み",
  saving: "保存中…",
  offline: "オフライン（この端末に保存済み）",
  conflict: "要確認（両方で変更あり）",
  paused: "自動同期オフ",
  error: "同期エラー",
};
