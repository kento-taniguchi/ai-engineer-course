"use client";

// Googleカレンダーとの接続状態（アクセストークンはこのメモリ上だけで保持し、保存・表示しない）

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "./AppStore";
import {
  GoogleApiError,
  READ_SCOPES,
  WRITE_SCOPES,
  deleteWorkEvent,
  eventIdForTodo,
  getEvent,
  hasScopes,
  listCalendars,
  listEvents,
  loadGis,
  requestToken,
  resolveClientId,
  revokeToken,
  upsertWorkEvent,
  type AccessToken,
} from "@/services/googleCalendar";
import { addLog, applySyncResult, missingLinkedEvents } from "@/lib/gcalSync";
import { addDaysKey, addMinutes, dateKey, toISO } from "@/lib/time";
import { todoTitle } from "@/lib/selectors";
import type { GCalEvent, GCalEvent as Ev } from "@/lib/types";

export type GoogleStatus = "unconfigured" | "disconnected" | "expired" | "connected";

interface GoogleValue {
  status: GoogleStatus;
  clientIdFrom: "env" | "settings" | null;
  busy: string | null;
  error: string | null;
  canWrite: boolean;
  connect: () => Promise<void>;
  sync: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  registerTodo: (todoId: string) => Promise<boolean>;
  removeTodoEvent: (todoId: string) => Promise<boolean>;
}

const Ctx = createContext<GoogleValue | null>(null);

/** 読み込む期間：2週間前〜60日後 */
export function syncRange(now: Date) {
  const today = dateKey(now);
  return { from: addDaysKey(today, -14), to: addDaysKey(today, 60) };
}

export function GoogleProvider({ children }: { children: ReactNode }) {
  const { data, now, update, notify } = useApp();
  const tokenRef = useRef<AccessToken | null>(null);
  const [tokenState, setTokenState] = useState<"none" | "valid" | "expired">("none");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { id: clientId, from: clientIdFrom } = resolveClientId(data.google?.clientId);

  // 有効期限の確認
  useEffect(() => {
    const t = setInterval(() => {
      if (tokenRef.current && tokenRef.current.expiresAt < Date.now() + 30000) {
        tokenRef.current = null;
        setTokenState("expired");
      }
    }, 30000);
    return () => clearInterval(t);
  }, []);

  // ボタンを押したときにすぐGoogleの画面を開けるよう、先に読み込んでおく
  useEffect(() => {
    if (clientId) loadGis().catch(() => undefined);
  }, [clientId]);

  const status: GoogleStatus = !clientId ? "unconfigured" : tokenState === "valid" ? "connected" : data.google?.connectedOnce ? "expired" : "disconnected";

  const fail = useCallback(
    (e: unknown, what: string) => {
      const msg = e instanceof Error ? e.message : `${what}に失敗しました`;
      if (e instanceof GoogleApiError && e.kind === "auth") {
        tokenRef.current = null;
        setTokenState(data.google?.connectedOnce ? "expired" : "none");
      }
      setError(msg);
      update((d, n) => ({ ...d, google: addLog(d.google, false, `${what}：${msg}`, n) }));
      notify(`${what}に失敗しました：${msg}`, "error");
    },
    [data.google?.connectedOnce, update, notify],
  );

  const sync = useCallback(async (): Promise<boolean> => {
    let token = tokenRef.current;
    if (!token && !(clientId && data.google?.connectedOnce)) {
      setError("Googleに接続していません。「Googleで連携する」を押してください");
      return false;
    }
    setBusy(token ? "予定を読み込み中…" : "Googleに自動で再接続中…");
    setError(null);
    try {
      // 接続の期限（約1時間）が切れていたら、ボタンを押したこの操作の中で自動的につなぎ直す
      // （一度許可していれば、Googleの小さな画面が一瞬開いて自動で閉じる）
      if (!token) {
        const t = await requestToken(clientId!, READ_SCOPES, "");
        if (!hasScopes(t, READ_SCOPES)) throw new GoogleApiError("auth", "必要な権限（カレンダーの一覧・予定の閲覧）が許可されませんでした");
        tokenRef.current = t;
        setTokenState("valid");
        token = t;
        setBusy("予定を読み込み中…");
      }
      const range = syncRange(new Date());
      const ids = data.google.readCalendarIds;
      if (ids.length === 0) throw new Error("読み込むカレンダーが選ばれていません");
      const fetched: { calendarId: string; events: GCalEvent[] }[] = [];
      for (const id of ids) fetched.push({ calendarId: id, events: await listEvents(token, id, range.from, range.to) });
      // 期間内に見つからなかった紐づけ済みの予定は1件ずつ確認する（期間外へ移動しただけなら削除扱いにしない）
      const checked: GCalEvent[] = [];
      for (const m of missingLinkedEvents(data, fetched, range)) {
        const ev = await getEvent(token, m.calendarId, m.eventId);
        if (ev) checked.push(ev);
      }
      // お知らせ文は現在のデータで先に計算し、保存は最新のデータに対して行う
      const s = applySyncResult(data, fetched, range, new Date(), checked).summary;
      const msg = `${s.fetched}件の予定を読み込みました${s.autoLinked ? `・繰り返し予定を${s.autoLinked}件紐づけ` : ""}${s.rescheduled.length ? `・日時変更${s.rescheduled.length}件` : ""}${s.removed.length ? `・削除${s.removed.length}件` : ""}`;
      update((d, n) => {
        const r = applySyncResult(d, fetched, range, n, checked);
        return { ...r.data, google: addLog(r.data.google, true, msg, n) };
      });
      notify(msg);
      return true;
    } catch (e) {
      fail(e, "予定の読み込み");
      return false;
    } finally {
      setBusy(null);
    }
  }, [data, clientId, update, notify, fail]);

  const connect = useCallback(async () => {
    if (!clientId) return;
    setBusy("Googleで確認中…");
    setError(null);
    try {
      const token = await requestToken(clientId, READ_SCOPES, data.google?.connectedOnce ? "" : "consent");
      if (!hasScopes(token, READ_SCOPES)) {
        throw new GoogleApiError("auth", "必要な権限（カレンダーの一覧・予定の閲覧）が許可されませんでした。もう一度、両方にチェックを入れて許可してください");
      }
      tokenRef.current = token;
      setTokenState("valid");
      const calendars = await listCalendars(token);
      update((d, n) => {
        const primary = calendars.find((c) => c.primary);
        const read = d.google.readCalendarIds.filter((id) => calendars.some((c) => c.id === id));
        const write = d.google.writeCalendarId && calendars.some((c) => c.id === d.google.writeCalendarId && c.accessRole === "owner") ? d.google.writeCalendarId : primary?.accessRole === "owner" ? primary.id : undefined;
        return {
          ...d,
          google: addLog({ ...d.google, connectedOnce: true, calendars, readCalendarIds: read.length ? read : primary ? [primary.id] : [], writeCalendarId: write }, true, `Googleに接続しました（カレンダー${calendars.length}件）`, n),
        };
      });
      notify("Googleに接続しました。読み込むカレンダーを確認してください");
    } catch (e) {
      tokenRef.current = null;
      setTokenState(data.google?.connectedOnce ? "expired" : "none");
      fail(e, "Googleへの接続");
    } finally {
      setBusy(null);
    }
  }, [clientId, data.google?.connectedOnce, update, notify, fail]);

  const disconnect = useCallback(async () => {
    await revokeToken(tokenRef.current);
    tokenRef.current = null;
    setTokenState("none");
    update((d, n) => ({ ...d, google: addLog({ ...d.google, connectedOnce: false }, true, "連携を解除しました（Google側の許可を取り消しました）", n) }), "連携を解除しました");
  }, [update]);

  /** 書き込みの権限を（必要なときに初めて）求める */
  const ensureWrite = useCallback(async (): Promise<AccessToken> => {
    const cur = tokenRef.current;
    if (cur && hasScopes(cur, WRITE_SCOPES)) return cur;
    if (!clientId) throw new GoogleApiError("auth", "GoogleのクライアントIDが設定されていません");
    const token = await requestToken(clientId, [...READ_SCOPES, ...WRITE_SCOPES], "");
    if (!hasScopes(token, WRITE_SCOPES)) throw new GoogleApiError("auth", "予定を登録する権限が許可されませんでした（登録はしていません）");
    tokenRef.current = token;
    setTokenState("valid");
    return token;
  }, [clientId]);

  const registerTodo = useCallback(
    async (todoId: string): Promise<boolean> => {
      const todo = data.todos.find((t) => t.id === todoId);
      const cal = data.google.writeCalendarId;
      if (!todo?.block || !cal) return false;
      const title = `【BASE-PLUS作業】${todoTitle(data, todo)}`;
      const start = todo.block.start;
      const end = addMinutes(start, todo.block.durationMin);
      const eventId = todo.gcal?.eventId ?? eventIdForTodo(todo.id);
      setBusy("Googleカレンダーに登録中…");
      try {
        const token = await ensureWrite();
        await upsertWorkEvent(token, cal, { eventId, todoId, title, start, end, description: "BASE-PLUS業務管理アプリから登録した作業予定です。" });
        update((d, n) => {
          const ev: Ev = { calendarId: cal, eventId, title, start, end, allDay: false, status: "confirmed", appTodoId: todoId };
          return {
            ...d,
            todos: d.todos.map((t) => (t.id === todoId ? { ...t, gcal: { calendarId: cal, eventId, start, durationMin: todo.block!.durationMin, title, status: "synced", at: toISO(n) } } : t)),
            google: addLog({ ...d.google, events: [...d.google.events.filter((e) => !(e.calendarId === cal && e.eventId === eventId)), ev] }, true, `作業予定を登録しました：${title}`, n),
          };
        }, "Googleカレンダーに登録しました");
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "登録に失敗しました";
        update((d, n) => ({
          ...d,
          todos: d.todos.map((t) => (t.id === todoId ? { ...t, gcal: { calendarId: cal, eventId, start, durationMin: todo.block!.durationMin, title, status: "error", at: toISO(n), error: msg } } : t)),
          google: addLog(d.google, false, `作業予定の登録に失敗：${msg}`, n),
        }));
        notify(`Googleカレンダーに登録できませんでした：${msg}`, "error");
        if (e instanceof GoogleApiError && e.kind === "auth") {
          tokenRef.current = null;
          setTokenState(data.google?.connectedOnce ? "expired" : "none");
        }
        return false;
      } finally {
        setBusy(null);
      }
    },
    [data, ensureWrite, update, notify],
  );

  const removeTodoEvent = useCallback(
    async (todoId: string): Promise<boolean> => {
      const todo = data.todos.find((t) => t.id === todoId);
      if (!todo?.gcal) return false;
      const { calendarId, eventId } = todo.gcal;
      setBusy("Googleカレンダーから削除中…");
      try {
        const token = await ensureWrite();
        await deleteWorkEvent(token, calendarId, eventId);
        update(
          (d, n) => ({
            ...d,
            todos: d.todos.map((t) => (t.id === todoId && t.gcal ? { ...t, gcal: { ...t.gcal, status: "removed", at: toISO(n), error: undefined } } : t)),
            google: addLog({ ...d.google, events: d.google.events.filter((e) => !(e.calendarId === calendarId && e.eventId === eventId)) }, true, "作業予定をGoogleカレンダーから削除しました", n),
          }),
          "Googleカレンダーから削除しました",
        );
        return true;
      } catch (e) {
        fail(e, "Googleカレンダーからの削除");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [data.todos, ensureWrite, update, fail],
  );

  const canWrite = status === "connected" && !!data.google?.writeCalendarId;

  return <Ctx.Provider value={{ status, clientIdFrom, busy, error, canWrite, connect, sync, disconnect, registerTodo, removeTodoEvent }}>{children}</Ctx.Provider>;
}

export function useGoogle(): GoogleValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGoogle は GoogleProvider の内側で使ってください");
  return v;
}

export const GOOGLE_STATUS_LABEL: Record<GoogleStatus, string> = {
  unconfigured: "未設定（初期設定が必要）",
  disconnected: "未接続",
  expired: "接続の期限切れ（「予定を読み込む」で自動的につなぎ直します）",
  connected: "接続中",
};

export function isRegisteredInGoogle(t: { gcal?: { status: string } }): boolean {
  return t.gcal?.status === "synced";
}

export function useNowKey(): string {
  const { now } = useApp();
  return dateKey(now);
}
