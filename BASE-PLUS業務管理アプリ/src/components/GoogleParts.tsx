"use client";

// Googleカレンダー連携の部品：登録前の確認、予定と対象者の紐づけ、変更のお知らせ、接続状況

import Link from "next/link";
import { useState } from "react";
import type { Booking, BookingKind, GCalEvent, TargetRef } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { GOOGLE_STATUS_LABEL, useGoogle } from "@/store/GoogleStore";
import { BOOKING_KIND_LABEL, targetHref, targetName, todoTitle } from "@/lib/selectors";
import { acknowledgeChange, candidatesFor, guessKind, linkEvent } from "@/lib/gcalSync";
import { addMinutes, dateKeyOf, formatDateTime, formatRange, overlaps } from "@/lib/time";
import { closeBookingTodos, openTodosOfBooking } from "@/lib/operations";
import { dayItems } from "./Schedule";
import { Modal } from "./ui";

export function GoogleStatusBadge() {
  const g = useGoogle();
  const cls = g.status === "connected" ? "badge-ok" : g.status === "expired" ? "badge-warning" : "badge-off";
  const icon = g.status === "connected" ? "✓" : g.status === "expired" ? "!" : "⊘";
  return (
    <span className={`badge ${cls}`}>
      {icon} Googleカレンダー：{GOOGLE_STATUS_LABEL[g.status]}
    </span>
  );
}

/** 月間予定・設定などに置く接続状況の案内 */
export function GoogleStatusPanel() {
  const { data } = useApp();
  const g = useGoogle();
  const last = data.google?.lastSync;
  return (
    <div className={`notice ${last && !last.ok ? "notice-danger" : "notice-info"} section`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="small stack" style={{ gap: 2 }}>
          <GoogleStatusBadge />
          <span>
            {last ? (
              <>
                最終更新 {formatDateTime(last.at)}：{last.ok ? "✓ " : "⚠ 失敗 "}
                {last.message}
              </>
            ) : g.status === "unconfigured" ? (
              "初期設定がまだです（Google Cloud での設定が必要）"
            ) : (
              "まだ読み込んでいません"
            )}
          </span>
        </div>
        <div className="row">
          {(g.status === "connected" || g.status === "expired") && (
            <button className="btn btn-sm" onClick={() => g.sync()} disabled={!!g.busy}>
              {g.busy ?? (last && !last.ok ? "再試行" : "予定を読み込む")}
            </button>
          )}
          {g.status === "disconnected" && (
            <button className="btn btn-sm btn-primary" onClick={() => g.connect()} disabled={!!g.busy}>
              {g.busy ?? "Googleに接続"}
            </button>
          )}
          <Link href="/google" className="btn btn-sm btn-ghost">
            連携の設定
          </Link>
        </div>
      </div>
    </div>
  );
}

/** ToDoの作業予定をGoogleカレンダーへ登録する前の確認画面 */
export function GcalRegisterDialog({ todoId, onClose }: { todoId: string; onClose: () => void }) {
  const { data } = useApp();
  const g = useGoogle();
  const [result, setResult] = useState<"ok" | "error" | null>(null);
  const todo = data.todos.find((t) => t.id === todoId);
  const cal = data.google.calendars.find((c) => c.id === data.google.writeCalendarId);
  if (!todo?.block) return null;
  const start = todo.block.start;
  const end = addMinutes(start, todo.block.durationMin);
  const title = `【BASE-PLUS作業】${todoTitle(data, todo)}`;
  const conflicts = dayItems(data, dateKeyOf(start)).filter((i) => i.id !== todo.id && overlaps(start, end, i.start, i.end));
  const already = todo.gcal?.status === "synced";

  return (
    <Modal
      title="Googleカレンダーに登録"
      onClose={onClose}
      actions={
        result === "ok" ? (
          <button className="btn btn-primary" onClick={onClose}>
            閉じる
          </button>
        ) : (
          <>
            <button className="btn" onClick={onClose} disabled={!!g.busy}>
              {result === "error" ? "閉じる（アプリ内の配置は残ります）" : "登録しない"}
            </button>
            <button
              className="btn btn-primary"
              disabled={!!g.busy || !cal || g.status === "unconfigured"}
              onClick={async () => setResult((await g.registerTodo(todoId)) ? "ok" : "error")}
            >
              {g.busy ?? (result === "error" ? "再試行する" : already ? "内容を更新する" : "登録する")}
            </button>
          </>
        )
      }
    >
      <dl className="fields">
        <dt>予定名</dt>
        <dd>{title}</dd>
        <dt>日時</dt>
        <dd>{formatRange(start, end)}（日本時間）</dd>
        <dt>登録先</dt>
        <dd>{cal ? cal.summary : "未設定（「Google連携」画面で選んでください）"}</dd>
      </dl>
      {conflicts.length > 0 ? (
        <div className="notice notice-warn small" style={{ marginTop: 12 }} role="status">
          ⚠ この時間に重なる予定があります：{conflicts.map((c) => `${formatRange(c.start, c.end)} ${c.label}`).join("、")}
        </div>
      ) : (
        <p className="xs muted" style={{ marginTop: 12 }}>
          重なる予定はありません（読み込み済みのGoogleカレンダーの予定を含む）
        </p>
      )}
      <p className="xs muted" style={{ marginTop: 8 }}>
        この作業に決まった予定IDで登録するため、通信が途切れて再試行しても二重に登録されません。初めて登録するときは、Googleの画面で「予定を作成・変更する権限」の確認が表示されます。
      </p>
      {result === "ok" && (
        <p className="notice notice-info small" role="status" style={{ marginTop: 12 }}>
          ✓ Googleカレンダーに登録しました。
        </p>
      )}
      {result === "error" && (
        <p className="notice notice-danger small" role="alert" style={{ marginTop: 12 }}>
          ⚠ 登録できませんでした：{data.todos.find((t) => t.id === todoId)?.gcal?.error ?? g.error}
          <br />
          Googleカレンダーには登録されていません。
        </p>
      )}
    </Modal>
  );
}

/** Googleの予定を選手・チームの予約に紐づける（候補は出すが、本人が選ぶ） */
export function LinkEventDialog({ event, onClose }: { event: GCalEvent; onClose: () => void }) {
  const { data, update } = useApp();
  const cands = candidatesFor(data, event.title);
  const [value, setValue] = useState(cands.length === 1 ? `${cands[0].target.type}:${cands[0].target.id}` : "");
  const target: TargetRef | null = value ? { type: value.split(":")[0] as TargetRef["type"], id: value.split(":")[1] } : null;
  const [kind, setKind] = useState<BookingKind | "">("");
  const effectiveKind: BookingKind = kind || (target ? guessKind(event.title, target) : "personal");
  const [series, setSeries] = useState(false);
  const cal = data.google.calendars.find((c) => c.id === event.calendarId);

  return (
    <Modal
      title="予定を予約に紐づける"
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button
            className="btn btn-primary"
            disabled={!target}
            onClick={() => {
              update((d, n) => linkEvent(d, event, target!, effectiveKind, series, n), `${targetName(data, target!)} の予約として紐づけました`);
              onClose();
            }}
          >
            この内容で紐づける
          </button>
        </>
      }
    >
      <div className="card stack" style={{ marginBottom: 16 }}>
        <strong>{event.title}</strong>
        <span>{formatRange(event.start, event.end)}（日本時間）</span>
        <span className="xs muted">
          {cal?.summary ?? "カレンダー"} {event.recurringEventId ? "・繰り返し予定のうちの1回" : ""}
        </span>
      </div>
      <div className="stack-2">
        {cands.length > 0 ? (
          <p className="small">
            予定名からの候補：
            {cands.map((c) => `${targetName(data, c.target)}（${c.reason}）`).join("、")}
            {cands.length > 1 && <strong>　→ 候補が複数あるため、選んでください</strong>}
          </p>
        ) : (
          <p className="small muted">予定名から対象者を判断できませんでした。選んでください。</p>
        )}
        <label className="field">
          対象者
          <select value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">選択してください</option>
            {cands.length > 0 && (
              <optgroup label="候補">
                {cands.map((c) => (
                  <option key={`c-${c.target.type}:${c.target.id}`} value={`${c.target.type}:${c.target.id}`}>
                    {targetName(data, c.target)}（{c.reason}）
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="選手">
              {data.players.map((p) => (
                <option key={p.id} value={`player:${p.id}`}>
                  {p.name}（{p.grade}）
                </option>
              ))}
            </optgroup>
            <optgroup label="チーム">
              {data.teams.map((t) => (
                <option key={t.id} value={`team:${t.id}`}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="field">
          種類
          <select value={effectiveKind} onChange={(e) => setKind(e.target.value as BookingKind)}>
            {(Object.keys(BOOKING_KIND_LABEL) as BookingKind[]).map((k) => (
              <option key={k} value={k}>
                {BOOKING_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        {event.recurringEventId && (
          <label className="check">
            <input type="checkbox" checked={series} onChange={(e) => setSeries(e.target.checked)} />
            この繰り返し予定のほかの回も、同じ対象者として紐づける（今後の読み込みでも自動）
          </label>
        )}
        {target && (
          <div className="notice notice-info small" role="status">
            <strong>{targetName(data, target)}</strong> の <strong>{formatRange(event.start, event.end)}</strong>（{BOOKING_KIND_LABEL[effectiveKind]}）の予約として紐づけます。
            前回記録の確認・指導メモ・リマインド・フィードバック・お礼のToDoが作られます。
          </div>
        )}
      </div>
    </Modal>
  );
}

/** キャンセル・削除された予約の未完了ToDoを、まとめて対象外にするボタン（確認画面つき） */
export function BulkCloseBookingTodosButton({ bookingId }: { bookingId: string }) {
  const { data } = useApp();
  const [open, setOpen] = useState(false);
  const b = data.bookings.find((x) => x.id === bookingId);
  const n = openTodosOfBooking(data, bookingId).length;
  if (!b || b.status === "scheduled" || n === 0) return null;
  return (
    <>
      <button className="btn btn-sm" onClick={() => setOpen(true)}>
        この予約のToDoをまとめて対象外（{n}件）
      </button>
      {open && <BulkCloseDialog bookingId={bookingId} onClose={() => setOpen(false)} />}
    </>
  );
}

function BulkCloseDialog({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const { data, update, notify } = useApp();
  const g = useGoogle();
  const b = data.bookings.find((x) => x.id === bookingId);
  const todos = openTodosOfBooking(data, bookingId);
  const synced = todos.filter((t) => t.gcal?.status === "synced");
  const [removeGoogle, setRemoveGoogle] = useState(true);
  const [working, setWorking] = useState(false);
  if (!b) return null;
  const why = b.status === "cancelled" ? "予約キャンセルのため、まとめて対象外" : "予定が削除されたため、まとめて対象外";

  const run = async () => {
    setWorking(true);
    let failed = 0;
    if (removeGoogle) {
      for (const t of synced) if (!(await g.removeTodoEvent(t.id))) failed++;
    }
    update((d, n) => closeBookingTodos(d, bookingId, why, n));
    notify(failed ? `${todos.length}件を対象外にしました（Googleカレンダーの作業予定${failed}件は削除できませんでした。カードの「Googleの予定を削除」から再試行できます）` : `${todos.length}件を対象外にしました`, failed ? "error" : "ok");
    setWorking(false);
    onClose();
  };

  return (
    <Modal
      title="この予約のToDoをまとめて対象外にしますか？"
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose} disabled={working}>
            やめる
          </button>
          <button className="btn btn-danger" onClick={run} disabled={working}>
            {working ? g.busy ?? "処理中…" : `${todos.length}件を対象外にする`}
          </button>
        </>
      }
    >
      <p className="small">
        <strong>{targetName(data, b.target)}</strong>（{formatRange(b.start, b.end)}・{b.status === "cancelled" ? "キャンセル" : "削除扱い"}）の、まだ終わっていないToDoです。
      </p>
      <ul className="small" style={{ margin: "8px 0 0 20px" }}>
        {todos.map((t) => (
          <li key={t.id}>{todoTitle(data, t)}</li>
        ))}
      </ul>
      {synced.length > 0 && (
        <label className="check" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={removeGoogle} onChange={(e) => setRemoveGoogle(e.target.checked)} />
          Googleカレンダーに登録した作業予定（{synced.length}件）も削除する
        </label>
      )}
      <p className="xs muted" style={{ marginTop: 12 }}>
        完了済みのToDo・レポート・指導メモは変更しません。対象外にしたToDoは「状態を変更」からいつでも戻せます。
      </p>
    </Modal>
  );
}

/** Googleカレンダー側の変更のお知らせ（今日の仕事の「確認が必要」に表示） */
export function ChangeNoticeCard({ booking }: { booking: Booking }) {
  const { data, update } = useApp();
  return (
    <article className="todo is-review">
      <div className="todo-body">
        <div className="row">
          <span className="status status-todo">
            <span aria-hidden="true">!</span>Googleカレンダーの変更
          </span>
        </div>
        <div className="todo-title" style={{ marginTop: 4 }}>
          {booking.target ? <Link href={targetHref(booking.target)}>{targetName(data, booking.target)}</Link> : "対象者未確定"} の予約
        </div>
        <div className="todo-meta">{booking.changeNotice}</div>
        <div className="todo-meta">現在の予約：{formatRange(booking.start, booking.end)}{booking.status !== "scheduled" && "（削除扱い・未完了のToDoは確認が必要に表示）"}</div>
        <div className="todo-actions">
          <button className="btn btn-sm" onClick={() => update((d) => acknowledgeChange(d, booking.id), "確認済みにしました")}>
            確認した
          </button>
          <BulkCloseBookingTodosButton bookingId={booking.id} />
          <Link href="/calendar" className="btn btn-sm btn-ghost">
            月間予定で見る
          </Link>
        </div>
      </div>
    </article>
  );
}
