"use client";

import Link from "next/link";
import { useState } from "react";
import type { Booking, BookingKind, TargetRef } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { BOOKING_KIND_ICON, BOOKING_KIND_LABEL, newId, reportOfBooking, targetHref, targetName } from "@/lib/selectors";
import {
  addDaysKey,
  addMonthsKey,
  combine,
  dateKey,
  dateKeyOf,
  daysInMonth,
  formatDate,
  formatDateTime,
  formatMonth,
  formatRange,
  formatTime,
  hhmmOf,
  monthKey,
  toISO,
  weekdayOf,
} from "@/lib/time";
import { addBooking, cancelBooking, deleteBooking, rescheduleBooking, restoreBooking, setBookingTarget } from "@/lib/operations";
import { STATUS_LABEL, TODO_LABEL } from "@/lib/todoEngine";
import { createDemoCalendarProvider, summarizeSync } from "@/services/calendar";
import { DemoBar, KindBadge, Modal, OffBadge, PageHead } from "@/components/ui";
import { PlanCard } from "@/components/LessonPlanParts";
import { GoogleStatusPanel, LinkEventDialog } from "@/components/GoogleParts";
import { useGoogle } from "@/store/GoogleStore";
import { linkedBooking, unlinkBooking } from "@/lib/gcalSync";
import type { GCalEvent } from "@/lib/types";

const WD = ["日", "月", "火", "水", "木", "金", "土"];

export default function CalendarPage() {
  const { data, now } = useApp();
  const google = useGoogle();
  const [gEvent, setGEvent] = useState<GCalEvent | null>(null);
  const [linkingEvent, setLinkingEvent] = useState<GCalEvent | null>(null);
  const gByDay = new Map<string, GCalEvent[]>();
  for (const e of data.google?.events ?? []) {
    if (e.status === "cancelled" || e.appTodoId) continue;
    const lb = linkedBooking(data, e);
    if (lb && lb.status === "scheduled") continue; // 予約として表示済み
    if (e.allDay) {
      for (let d = e.startDate!; d < e.endDate!; d = addDaysKey(d, 1)) gByDay.set(d, [...(gByDay.get(d) ?? []), e]);
    } else {
      const k = dateKeyOf(e.start);
      gByDay.set(k, [...(gByDay.get(k) ?? []), e]);
    }
  }
  const [mk, setMk] = useState(monthKey(now));
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [showCancelled, setShowCancelled] = useState(true);
  const today = dateKey(now);

  const first = `${mk}-01`;
  const lead = weekdayOf(first);
  const total = daysInMonth(mk);
  const cells = Array.from({ length: Math.ceil((lead + total) / 7) * 7 }, (_, i) => addDaysKey(first, i - lead));

  const visible = data.bookings.filter((b) => b.status === "scheduled" || (showCancelled && b.status === "cancelled"));
  const byDay = new Map<string, Booking[]>();
  for (const b of visible) {
    const k = dateKeyOf(b.start);
    byDay.set(k, [...(byDay.get(k) ?? []), b]);
  }
  byDay.forEach((list) => list.sort((a, b) => a.start.localeCompare(b.start)));
  const monthList = visible.filter((b) => b.start.slice(0, 7) === mk).sort((a, b) => a.start.localeCompare(b.start));
  const sel = selected ? data.bookings.find((b) => b.id === selected) : undefined;

  return (
    <>
      <PageHead title="月間予定" sub={<OffBadge>Googleカレンダー未連携</OffBadge>}>
        <button className="btn btn-primary" onClick={() => setAdding(today)}>
          ＋ 予定を追加（デモ）
        </button>
      </PageHead>
      <DemoBar>架空の予定です。ここで予定を変更・キャンセル・削除すると、ToDoがどう変わるか確認できます。</DemoBar>

      {google.status === "unconfigured" ? <SyncPanel /> : <GoogleStatusPanel />}

      <div className="section-head">
        <div className="row">
          <button className="btn btn-sm" onClick={() => setMk(addMonthsKey(mk, -1))} aria-label="前の月">
            ‹ 前月
          </button>
          <h2 style={{ minWidth: 140, textAlign: "center" }}>{formatMonth(mk)}</h2>
          <button className="btn btn-sm" onClick={() => setMk(addMonthsKey(mk, 1))} aria-label="次の月">
            翌月 ›
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setMk(monthKey(now))}>
            今月
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
          キャンセルも表示
        </label>
      </div>

      <div className="legend" style={{ marginBottom: 8 }}>
        {(Object.keys(BOOKING_KIND_LABEL) as BookingKind[]).map((k) => (
          <span key={k}>
            <span className={`ev ev-${k}`} style={{ display: "inline-block", width: "auto", marginRight: 4 }}>
              {BOOKING_KIND_ICON[k]}
            </span>
            {BOOKING_KIND_LABEL[k]}
          </span>
        ))}
        <span>
          <span className="ev is-cancelled" style={{ display: "inline-block", width: "auto", marginRight: 4 }}>
            ×
          </span>
          キャンセル
        </span>
      </div>

      <div className="month-grid" role="grid" aria-label={`${formatMonth(mk)}の予定`}>
        {WD.map((w, i) => (
          <div key={w} className="mg-head" role="columnheader" style={{ color: i === 0 ? "#b3261e" : i === 6 ? "#2c3e66" : undefined }}>
            {w}
          </div>
        ))}
        {cells.map((d) => {
          const out = d.slice(0, 7) !== mk;
          const list = byDay.get(d) ?? [];
          return (
            <div key={d} className={`mg-cell ${out ? "is-out" : ""} ${d === today ? "is-today" : ""}`} role="gridcell">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="mg-day">
                  {Number(d.slice(8))}
                  {d === today && <span className="sr-only">（今日）</span>}
                </span>
                {!out && (
                  <button className="btn-ghost xs hide-mobile" style={{ border: "none", background: "none", cursor: "pointer", color: "#9aa3b2" }} onClick={() => setAdding(d)} aria-label={`${d}に予定を追加`}>
                    ＋
                  </button>
                )}
              </div>
              {(gByDay.get(d) ?? []).map((e) => (
                <button key={`g-${e.calendarId}-${e.eventId}`} className="ev ev-gcal" onClick={() => setGEvent(e)} title={`${e.allDay ? "終日" : formatTime(e.start)} ${e.title}（Googleカレンダー）`}>
                  ◇ {e.allDay ? "終日" : formatTime(e.start)}
                  <span className="ev-text"> {e.title}</span>
                </button>
              ))}
              {list.map((b) => (
                <button key={b.id} className={`ev ev-${b.kind} ${b.status === "cancelled" ? "is-cancelled" : ""}`} onClick={() => setSelected(b.id)} title={`${formatTime(b.start)} ${targetName(data, b.target)}`}>
                  {b.status === "cancelled" ? "×" : BOOKING_KIND_ICON[b.kind]} {formatTime(b.start)}
                  <span className="ev-text"> {shortName(targetName(data, b.target))}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>

      <section className="section" style={{ marginTop: 24 }} aria-labelledby="h-month-list">
        <h2 id="h-month-list" style={{ marginBottom: 8 }}>
          {formatMonth(mk)}の予定一覧
        </h2>
        <ul className="list">
          {monthList.length === 0 && <li style={{ padding: 16 }} className="muted small">予定はありません</li>}
          {monthList.map((b) => (
            <li key={b.id}>
              <button className="list-link" style={{ width: "100%", border: "none", background: "none", font: "inherit", textAlign: "left", cursor: "pointer" }} onClick={() => setSelected(b.id)}>
                <div className="list-main">
                  <div className="row">
                    <strong style={{ textDecoration: b.status === "cancelled" ? "line-through" : undefined }}>{formatRange(b.start, b.end)}</strong>
                    <KindBadge kind={b.kind} />
                    {b.status === "cancelled" && <span className="badge badge-off">キャンセル</span>}
                    {!b.target && <span className="badge badge-warning">? 対象者未確定</span>}
                  </div>
                  <div className="small muted">{targetName(data, b.target)}</div>
                </div>
                <span className="chev" aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {sel && <BookingDialog booking={sel} onClose={() => setSelected(null)} />}
      {gEvent && (
        <Modal title="Googleカレンダーの予定" onClose={() => setGEvent(null)} actions={<button className="btn" onClick={() => setGEvent(null)}>閉じる</button>}>
          <div className="stack">
            <strong>{gEvent.title}</strong>
            <span>{gEvent.allDay ? `終日（${formatDate(gEvent.startDate!)}${gEvent.endDate && addDaysKey(gEvent.startDate!, 1) !== gEvent.endDate ? `〜${formatDate(addDaysKey(gEvent.endDate, -1))}` : ""}）` : `${formatRange(gEvent.start, gEvent.end)}（日本時間）`}</span>
            <span className="xs muted">{data.google.calendars.find((c) => c.id === gEvent.calendarId)?.summary}{gEvent.recurringEventId ? "・繰り返し予定" : ""}</span>
            {!gEvent.allDay && (
              <div>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    setLinkingEvent(gEvent);
                    setGEvent(null);
                  }}
                >
                  選手・チームの予約に紐づける
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}
      {linkingEvent && <LinkEventDialog event={linkingEvent} onClose={() => setLinkingEvent(null)} />}
      {adding && <AddBookingDialog day={adding} onClose={() => setAdding(null)} />}
    </>
  );
}

function shortName(n: string): string {
  return n.replace("（架空）", "").split(/[\s　]/)[0];
}

function SyncPanel() {
  const { data, update, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const last = data.syncLogs[data.syncLogs.length - 1];
  const run = async () => {
    setBusy(true);
    const provider = createDemoCalendarProvider({ simulateFailure: data.settings.simulateSyncFailure, current: () => data.bookings });
    try {
      const events = await provider.fetchEvents("", "");
      const msg = summarizeSync(data, events);
      update((d) => ({ ...d, syncLogs: [...d.syncLogs.slice(-9), { at: toISO(new Date()), ok: true, message: msg }] }));
      notify(msg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "同期に失敗しました";
      update((d) => ({ ...d, syncLogs: [...d.syncLogs.slice(-9), { at: toISO(new Date()), ok: false, message: msg }] }));
      notify(`同期に失敗しました：${msg}`, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`notice ${last && !last.ok ? "notice-danger" : "notice-info"} section`} style={{ marginBottom: 24 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="small">
          <strong>カレンダー同期</strong>（デモ・実際には接続しません）
          <br />
          {last ? (
            <>
              最終実行 {formatDateTime(last.at)}：{last.ok ? "✓ " : "⚠ 失敗 "}
              {last.message}
            </>
          ) : (
            "まだ実行していません"
          )}
        </div>
        <button className="btn btn-sm" onClick={run} disabled={busy}>
          {busy ? "同期中…" : last && !last.ok ? "再試行（デモ）" : "再同期（デモ）"}
        </button>
      </div>
    </div>
  );
}

function BookingDialog({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const { data, update } = useApp();
  const [mode, setMode] = useState<"view" | "move" | "cancel">("view");
  const [day, setDay] = useState(dateKeyOf(booking.start));
  const [start, setStart] = useState(hhmmOf(booking.start));
  const [end, setEnd] = useState(hhmmOf(booking.end));
  const [reason, setReason] = useState("");
  const [targetSel, setTargetSel] = useState("");
  const todos = data.todos.filter((t) => t.bookingId === booking.id);
  const report = reportOfBooking(data, booking.id);
  const valid = start < end;

  return (
    <Modal title="予定の詳細" onClose={onClose} actions={<button className="btn" onClick={onClose}>閉じる</button>}>
      <div className="stack-2">
        <div>
          <div className="row">
            <KindBadge kind={booking.kind} />
            {booking.status !== "scheduled" && <span className="badge badge-danger">{booking.status === "cancelled" ? "キャンセル" : "削除"}</span>}
          </div>
          <p style={{ marginTop: 8 }}>
            <strong>{formatRange(booking.start, booking.end)}</strong>
          </p>
          <p className="small">
            対象：{booking.target ? <Link href={targetHref(booking.target)}>{targetName(data, booking.target)}</Link> : <span className="badge badge-warning">? 対象者未確定</span>}
          </p>
          <p className="small muted">予定名：{booking.title}</p>
          {booking.location && <p className="small muted">場所：{booking.location}</p>}
          {report && (
            <p className="small">
              <Link href={`/report?id=${report.id}`}>✓ レポートあり（開く）</Link>
            </p>
          )}
          {booking.target && (
            <div style={{ marginTop: 8 }}>
              <PlanCard booking={booking} compact />
            </div>
          )}
        </div>

        {!booking.target && booking.status === "scheduled" && (
          <div className="row">
            <select value={targetSel} onChange={(e) => setTargetSel(e.target.value)} aria-label="対象者を選択" style={{ maxWidth: 260 }}>
              <option value="">対象者を選択</option>
              {data.players.map((p) => (
                <option key={p.id} value={`player:${p.id}`}>
                  {p.name}
                </option>
              ))}
              {data.teams.map((t) => (
                <option key={t.id} value={`team:${t.id}`}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              className="btn btn-sm btn-primary"
              disabled={!targetSel}
              onClick={() => {
                const [type, id] = targetSel.split(":") as [TargetRef["type"], string];
                update((d, n) => setBookingTarget(d, booking.id, { type, id }, n), "対象者を設定しました");
              }}
            >
              設定
            </button>
          </div>
        )}

        {booking.source === "google" && (
          <div className="notice notice-info small stack">
            <span>この予約はGoogleカレンダーの予定に紐づいています。日時の変更・キャンセルはGoogleカレンダーで行ってください（次の読み込みで反映し、変更内容を表示します）。</span>
            {booking.status === "scheduled" && (
              <div>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    if (confirm(`${targetName(data, booking.target)}（${formatRange(booking.start, booking.end)}）の紐づけを解除しますか？\n（レポート・完了の記録は残ります。Googleの予定は変更しません）`)) update((d, n) => unlinkBooking(d, booking.id, n), "紐づけを解除しました");
                  }}
                >
                  紐づけを解除
                </button>
              </div>
            )}
          </div>
        )}
        {mode === "view" && booking.source !== "google" && (
          <div className="row">
            {booking.status === "scheduled" ? (
              <>
                <button className="btn" onClick={() => setMode("move")}>
                  日時を変更・延期
                </button>
                <button className="btn btn-danger" onClick={() => setMode("cancel")}>
                  キャンセル
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    if (confirm("この予定を削除しますか？\n（完了済みのToDoやレポートは削除されません。未完了のToDoは「確認が必要」になります）")) {
                      update((d, n) => deleteBooking(d, booking.id, n), "予定を削除しました。未完了のToDoは「確認が必要」に表示されます");
                    }
                  }}
                >
                  削除
                </button>
              </>
            ) : (
              <button className="btn" onClick={() => update((d, n) => restoreBooking(d, booking.id, n), "予定を元に戻しました")}>
                予定を元に戻す
              </button>
            )}
          </div>
        )}

        {mode === "move" && (
          <div className="card stack-2">
            <h3>日時を変更・延期</h3>
            <div className="grid-3" style={{ gap: 8 }}>
              <label className="field">
                日付
                <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
              </label>
              <label className="field">
                開始
                <input type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label className="field">
                終了
                <input type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} />
              </label>
            </div>
            {!valid && <p className="small" style={{ color: "var(--danger)" }}>⚠ 終了時刻は開始時刻より後にしてください</p>}
            <p className="xs muted">未完了のToDoは新しい日時に合わせて表示されます。完了済みのリマインド等は「確認が必要」になります。</p>
            <div className="row">
              <button
                className="btn btn-primary"
                disabled={!valid}
                onClick={() => {
                  update((d, n) => rescheduleBooking(d, booking.id, combine(day, start), combine(day, end), n), "日時を変更しました");
                  setMode("view");
                }}
              >
                変更する
              </button>
              <button className="btn" onClick={() => setMode("view")}>
                やめる
              </button>
            </div>
          </div>
        )}

        {mode === "cancel" && (
          <div className="card stack-2">
            <h3>キャンセル</h3>
            <label className="field">
              理由（任意）
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：雨天のため" />
            </label>
            <p className="xs muted">未着手のToDoは自動で「対象外」になります（元に戻せます）。作業中のToDo・完了済みの記録・レポートは残ります。</p>
            <div className="row">
              <button
                className="btn btn-danger"
                onClick={() => {
                  update((d, n) => cancelBooking(d, booking.id, reason, n), "予定をキャンセルしました");
                  setMode("view");
                }}
              >
                キャンセルする
              </button>
              <button className="btn" onClick={() => setMode("view")}>
                やめる
              </button>
            </div>
          </div>
        )}

        {todos.length > 0 && (
          <details>
            <summary className="small">この予定のToDo（{todos.length}件）</summary>
            <ul className="small" style={{ paddingLeft: 20 }}>
              {todos.map((t) => (
                <li key={t.id}>
                  {TODO_LABEL[t.kind]}
                  ：{STATUS_LABEL[t.status]}
                  {t.statusReason && `（${t.statusReason}）`}
                  {t.needsReview && <span className="badge badge-warning" style={{ marginLeft: 4 }}>? 確認が必要</span>}
                </li>
              ))}
            </ul>
          </details>
        )}

        <details>
          <summary className="small">変更履歴（{booking.history.length}件）</summary>
          <ul className="small muted" style={{ paddingLeft: 20 }}>
            {booking.history
              .slice()
              .reverse()
              .map((h, i) => (
                <li key={i}>
                  {formatDateTime(h.at)}：{h.detail}
                </li>
              ))}
          </ul>
        </details>
      </div>
    </Modal>
  );
}

function AddBookingDialog({ day: initialDay, onClose }: { day: string; onClose: () => void }) {
  const { data, update } = useApp();
  const [day, setDay] = useState(initialDay);
  const [start, setStart] = useState("17:00");
  const [end, setEnd] = useState("18:00");
  const [kind, setKind] = useState<BookingKind>("personal");
  const [target, setTarget] = useState("");
  const valid = start < end;

  return (
    <Modal
      title="予定を追加（デモ）"
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button
            className="btn btn-primary"
            disabled={!valid}
            onClick={() => {
              const [type, id] = target ? (target.split(":") as [TargetRef["type"], string]) : [null, null];
              const t: TargetRef | null = type && id ? { type, id } : null;
              const name = t ? targetName(data, t) : "（対象者未確定）";
              const bid = newId("b");
              const b: Booking = {
                id: bid,
                calendarEventId: `demo-event-${bid}`,
                title: `【BASE-PLUS】${BOOKING_KIND_LABEL[kind]} ${name}`,
                kind,
                target: t,
                start: combine(day, start),
                end: combine(day, end),
                location: kind === "online" ? "オンライン" : "",
                status: "scheduled",
                history: [{ at: toISO(new Date()), type: "created", detail: "アプリで追加（デモ）" }],
              };
              update((d, n) => {
                const next = addBooking(d, b, n);
                if (kind === "team" || !t) return next;
                return {
                  ...next,
                  sales: [
                    ...next.sales,
                    { id: `sale-${bid}`, month: b.start.slice(0, 7), service: kind === "online" ? "online" : kind === "trial" ? "other" : "personal", description: `${BOOKING_KIND_LABEL[kind]} ${day.slice(5).replace("-", "/")}`, amount: kind === "online" ? 4000 : kind === "trial" ? 3000 : 6000, status: "planned", source: { type: "booking", bookingId: bid } },
                  ],
                };
              }, "予定を追加しました（アプリ内のみ）");
              onClose();
            }}
          >
            追加する
          </button>
        </>
      }
    >
      <div className="stack-2">
        <label className="field">
          種類
          <select value={kind} onChange={(e) => setKind(e.target.value as BookingKind)}>
            {(Object.keys(BOOKING_KIND_LABEL) as BookingKind[]).map((k) => (
              <option key={k} value={k}>
                {BOOKING_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          対象者
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">未確定（あとで選ぶ）</option>
            <optgroup label="選手">
              {data.players.map((p) => (
                <option key={p.id} value={`player:${p.id}`}>
                  {p.name}
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
        <div className="grid-3" style={{ gap: 8 }}>
          <label className="field">
            日付
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
          <label className="field">
            開始
            <input type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="field">
            終了
            <input type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        {!valid && <p className="small" style={{ color: "var(--danger)" }}>⚠ 終了時刻は開始時刻より後にしてください</p>}
        <p className="xs muted">※ アプリ内にのみ追加されます（Googleカレンダー未連携）。</p>
      </div>
    </Modal>
  );
}
