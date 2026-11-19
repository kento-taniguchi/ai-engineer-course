"use client";

// Googleカレンダー連携の設定・接続・予定の紐づけ

import Link from "next/link";
import { useState } from "react";
import type { GCalEvent } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { GOOGLE_STATUS_LABEL, useGoogle } from "@/store/GoogleStore";
import { SCOPE_PURPOSE, isValidClientId } from "@/services/googleCalendar";
import { candidatesFor, eventKey, setIgnored, unlinkBooking, unlinkedEvents } from "@/lib/gcalSync";
import { BOOKING_KIND_LABEL, targetName } from "@/lib/selectors";
import { dateKey, formatDate, formatDateTime, formatRange } from "@/lib/time";
import { ChangeNoticeCard, GoogleStatusBadge, LinkEventDialog } from "@/components/GoogleParts";
import { Empty, Modal, PageHead } from "@/components/ui";

export default function GooglePage() {
  const { data, now, update } = useApp();
  const g = useGoogle();
  const gs = data.google;
  const [clientId, setClientId] = useState(gs.clientId ?? "");
  const [linking, setLinking] = useState<GCalEvent | null>(null);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const today = dateKey(now);
  const unlinked = unlinkedEvents(data).filter((e) => !gs.ignored.includes(eventKey(e)) && (showPast || e.end.slice(0, 10) >= today));
  const ignored = data.google.events.filter((e) => gs.ignored.includes(eventKey(e)));
  const linked = data.bookings.filter((b) => b.source === "google").sort((a, b) => a.start.localeCompare(b.start));
  const notices = data.bookings.filter((b) => b.changeNotice);
  const owned = gs.calendars.filter((c) => c.accessRole === "owner");

  return (
    <>
      <PageHead title="Google連携" sub="Googleカレンダーの予定の読み込み・予約との紐づけ・作業予定の登録">
        <GoogleStatusBadge />
      </PageHead>

      {/* ---- 1. 初期設定 ---- */}
      <section className="card section stack-2" aria-labelledby="h-g-setup">
        <h2 id="h-g-setup">1. 初期設定（最初に1回だけ）</h2>
        {g.clientIdFrom === "env" ? (
          <p className="small">
            <span className="badge badge-ok">✓ クライアントIDは設定ファイル（.env.local）で設定済み</span>
          </p>
        ) : (
          <>
            <p className="small">
              Google Cloud で作成した「OAuth クライアントID」を入力します（作り方は <code>docs/Googleカレンダー連携の設定.md</code>）。
              クライアントIDは公開される識別子で、パスワードではありません。<strong>クライアントシークレットやパスワードは入力しないでください。</strong>
            </p>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <label className="field" style={{ flex: 1 }}>
                <span className="sr-only">OAuth クライアントID</span>
                <input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="000000000000-xxxxxxxx.apps.googleusercontent.com" autoComplete="off" spellCheck={false} />
              </label>
              <button
                className="btn btn-primary"
                disabled={!isValidClientId(clientId) || clientId.trim() === (gs.clientId ?? "")}
                onClick={() => update((d) => ({ ...d, google: { ...d.google, clientId: clientId.trim() } }), "クライアントIDを保存しました（まだ接続はしていません）")}
              >
                保存
              </button>
            </div>
            {clientId && !isValidClientId(clientId) && <p className="small" style={{ color: "var(--danger)" }}>⚠ 形式が違います（「数字-英数字.apps.googleusercontent.com」の形）</p>}
            {gs.clientId && <p className="xs muted">保存済み（この端末のブラウザ内）。保存しただけでは連携は完了していません。</p>}
          </>
        )}
      </section>

      {/* ---- 2. 接続 ---- */}
      <section className="card section stack-2" aria-labelledby="h-g-connect">
        <h2 id="h-g-connect">2. Googleに接続</h2>
        <p className="small">状態：{GOOGLE_STATUS_LABEL[g.status]}</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>求める権限</th>
                <th>目的</th>
              </tr>
            </thead>
            <tbody>
              {SCOPE_PURPOSE.map((s) => (
                <tr key={s.scope}>
                  <td>{s.label}</td>
                  <td className="small">{s.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="xs muted">
          接続はこの端末のブラウザの中だけで行い、アクセス用の情報は保存しません（約1時間で切れるため、そのたびに「Googleに再接続」を押します）。カレンダーの予定はこの端末のブラウザに控えとして保存されます。
        </p>
        <div className="row">
          {g.status === "connected" || g.status === "expired" ? (
            <>
              <button className="btn btn-primary" onClick={() => g.sync()} disabled={!!g.busy || gs.readCalendarIds.length === 0}>
                {g.busy ?? "予定を読み込む"}
              </button>
              <button className="btn btn-ghost" onClick={() => confirm("Googleとの連携を解除しますか？\n（Google側の許可を取り消します。読み込んだ予定の控えと紐づけはこの端末に残ります）") && g.disconnect()}>
                連携を解除
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => g.connect()} disabled={!!g.busy || g.status === "unconfigured"}>
              {g.busy ?? "Googleで連携する"}
            </button>
          )}
        </div>
        {g.status === "unconfigured" && <p className="small muted">先に「1. 初期設定」を完了してください。</p>}
        {g.error && (
          <div className="notice notice-danger small" role="alert">
            ⚠ {g.error}
          </div>
        )}
        {gs.lastSync && (
          <p className="small">
            最終更新：{formatDateTime(gs.lastSync.at)}　{gs.lastSync.ok ? "✓" : "⚠ 失敗"} {gs.lastSync.message}
            {gs.range && <span className="xs muted">（読み込み期間 {formatDate(gs.range.from)}〜{formatDate(gs.range.to)}）</span>}
          </p>
        )}
      </section>

      {/* ---- 3. カレンダーの選択 ---- */}
      {gs.calendars.length > 0 && (
        <section className="card section stack-2" aria-labelledby="h-g-cals">
          <h2 id="h-g-cals">3. 使うカレンダー</h2>
          <fieldset style={{ border: "none", padding: 0, margin: 0 }} className="stack">
            <legend className="small" style={{ fontWeight: 700, color: "var(--navy)", marginBottom: 4 }}>
              読み込むカレンダー（BASE-PLUSの予定や、重なりを確認したい予定があるもの）
            </legend>
            {gs.calendars.map((c) => (
              <label key={c.id} className="check">
                <input
                  type="checkbox"
                  checked={gs.readCalendarIds.includes(c.id)}
                  onChange={(e) =>
                    update((d) => ({
                      ...d,
                      google: { ...d.google, readCalendarIds: e.target.checked ? [...d.google.readCalendarIds, c.id] : d.google.readCalendarIds.filter((x) => x !== c.id) },
                    }))
                  }
                />
                {c.summary}
                {c.primary && <span className="badge badge-kind">メイン</span>}
              </label>
            ))}
          </fieldset>
          <label className="field">
            作業予定を登録するカレンダー（自分が所有するカレンダーのみ）
            <select value={gs.writeCalendarId ?? ""} onChange={(e) => update((d) => ({ ...d, google: { ...d.google, writeCalendarId: e.target.value || undefined } }), "登録先を変更しました")}>
              <option value="">登録しない</option>
              {owned.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.summary}
                </option>
              ))}
            </select>
          </label>
          <p className="xs muted">「BASE-PLUS作業」用のカレンダーをGoogleカレンダーで作っておくと、ほかの予定と分けて管理できます（作った後は再接続すると一覧に出ます）。</p>
        </section>
      )}

      {/* ---- 変更のお知らせ ---- */}
      {notices.length > 0 && (
        <section className="section stack" aria-labelledby="h-g-notices">
          <h2 id="h-g-notices">Googleカレンダー側の変更（{notices.length}件）</h2>
          {notices.map((b) => (
            <ChangeNoticeCard key={b.id} booking={b} />
          ))}
        </section>
      )}

      {/* ---- 4. 紐づけ ---- */}
      <section className="section stack-2" aria-labelledby="h-g-link">
        <div className="section-head" style={{ marginBottom: 0 }}>
          <h2 id="h-g-link">4. 予定を選手・チームの予約に紐づける</h2>
          <label className="check">
            <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
            過去の予定も表示
          </label>
        </div>
        <p className="xs muted">予定名から候補を出しますが、自動では決めません。対象者と日時を確認して紐づけてください。紐づけた予約からToDoが作られます（何度読み込んでも重複しません）。</p>
        {gs.events.length === 0 ? (
          <Empty>まだ予定を読み込んでいません</Empty>
        ) : unlinked.length === 0 ? (
          <Empty>紐づけていない予定はありません</Empty>
        ) : (
          <ul className="list">
            {unlinked.map((e) => {
              const c = candidatesFor(data, e.title);
              return (
                <li key={eventKey(e)} className="row" style={{ padding: "12px 16px", justifyContent: "space-between" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong>{e.title}</strong>
                    <div className="small muted">
                      {formatRange(e.start, e.end)} ・ {gs.calendars.find((x) => x.id === e.calendarId)?.summary ?? ""}
                      {e.recurringEventId && " ・ 繰り返し"}
                    </div>
                    {c.length > 0 && <div className="xs">候補：{c.map((x) => targetName(data, x.target)).join("、")}</div>}
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    <button className="btn btn-sm btn-primary" onClick={() => setLinking(e)}>
                      紐づける
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => update((d) => setIgnored(d, e, true), "BASE-PLUSの予約ではない予定にしました")}>
                      予約ではない
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {ignored.length > 0 && (
          <details className="record">
            <summary className="small">「予約ではない」にした予定（{ignored.length}件）</summary>
            <ul className="record-body small" style={{ listStyle: "none", paddingLeft: 16 }}>
              {ignored.map((e) => (
                <li key={eventKey(e)} className="row" style={{ justifyContent: "space-between" }}>
                  <span>
                    {formatRange(e.start, e.end)} {e.title}
                  </span>
                  <button className="btn btn-sm btn-ghost" onClick={() => update((d) => setIgnored(d, e, false), "元に戻しました")}>
                    元に戻す
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="section stack-2" aria-labelledby="h-g-linked">
        <h2 id="h-g-linked">紐づけ済みの予約（{linked.length}件）</h2>
        {linked.length === 0 ? (
          <Empty>まだありません</Empty>
        ) : (
          <ul className="list">
            {linked.map((b) => (
              <li key={b.id} className="row" style={{ padding: "12px 16px", justifyContent: "space-between" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong>{targetName(data, b.target)}</strong> <span className="badge badge-kind">{BOOKING_KIND_LABEL[b.kind]}</span>
                  {b.status !== "scheduled" && <span className="badge badge-off">{b.history[b.history.length - 1]?.detail === "紐づけを解除" ? "解除済み" : "削除扱い"}</span>}
                  <div className="small muted">
                    {formatRange(b.start, b.end)} ・ 予定名「{b.title}」
                  </div>
                </div>
                {b.status === "scheduled" && (
                  <button className="btn btn-sm btn-ghost" onClick={() => setUnlinking(b.id)}>
                    紐づけを解除
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {gs.logs.length > 0 && (
        <details className="record section">
          <summary className="small">連携の履歴（最新20件）</summary>
          <ul className="record-body small">
            {[...gs.logs].reverse().map((l, i) => (
              <li key={i}>
                {formatDateTime(l.at)} {l.ok ? "✓" : "⚠"} {l.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="xs muted section">
        <Link href="/settings">設定</Link>：データの書き出し・読み込み（バックアップ）はこちら。
      </p>

      {linking && <LinkEventDialog event={linking} onClose={() => setLinking(null)} />}
      {unlinking && (
        <Modal
          title="紐づけを解除しますか？"
          onClose={() => setUnlinking(null)}
          actions={
            <>
              <button className="btn" onClick={() => setUnlinking(null)}>
                やめる
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  update((d, n) => unlinkBooking(d, unlinking, n), "紐づけを解除しました");
                  setUnlinking(null);
                }}
              >
                解除する
              </button>
            </>
          }
        >
          {(() => {
            const b = data.bookings.find((x) => x.id === unlinking)!;
            return (
              <p className="small">
                <strong>{targetName(data, b.target)}</strong>（{formatRange(b.start, b.end)}）の紐づけを解除します。未完了のToDoは対象外になり、作成済みのレポート・指導メモ・完了の記録は残ります。Googleカレンダーの予定は変更しません。
              </p>
            );
          })()}
        </Modal>
      )}
    </>
  );
}
