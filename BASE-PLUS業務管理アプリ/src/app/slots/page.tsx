"use client";

// 予約枠管理（第3版）
//  - 通常枠: 16:10〜17:10 / 17:20〜18:20 / 18:30〜19:30 / 19:40〜20:40 / 20:50〜21:50（各60分・間10分）
//  - 曜日ごとの営業有無は未設定から本人が決める（勝手に決めない）
//  - 日ごとの例外（終日休み・特定の枠だけ休み・臨時枠）
//  - 既存の予約・旧来の曜日別設定（weeklySlots）は変更・削除しない

import { useState } from "react";
import type { SlotException } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { newId, targetName } from "@/lib/selectors";
import { addDaysKey, dateKey, formatDate, formatTime, weekdayLabel, weekdayOf } from "@/lib/time";
import { DEFAULT_STANDARD_SLOTS } from "@/lib/migrate";
import { checkStandardSlots, dayPlan, type SlotState } from "@/lib/slots";
import { DemoBar, OffBadge, PageHead } from "@/components/ui";

const ORDER = [1, 2, 3, 4, 5, 6, 0];
const STATE: Record<SlotState, { label: string; cls: string; icon: string }> = {
  free: { label: "空き", cls: "badge-ok", icon: "○" },
  booked: { label: "予約済み", cls: "badge-kind", icon: "●" },
  closed: { label: "休み", cls: "badge-danger", icon: "×" },
  undecided: { label: "営業未設定", cls: "badge-off", icon: "?" },
};

export default function SlotsPage() {
  const { data, now, update } = useApp();
  const today = dateKey(now);
  const slots = [...(data.standardSlots ?? [])].sort((a, b) => a.start.localeCompare(b.start));
  const checks = checkStandardSlots(slots);
  const [ex, setEx] = useState<Omit<SlotException, "id">>({ date: addDaysKey(today, 7), type: "closed", memo: "", start: "16:10", end: "17:10", slotId: slots[0]?.id });
  const days = Array.from({ length: 14 }, (_, i) => addDaysKey(today, i));
  const isDefault = JSON.stringify(slots.map((s) => [s.start, s.end])) === JSON.stringify(DEFAULT_STANDARD_SLOTS.map((s) => [s.start, s.end]));

  const patchSlot = (id: string, p: { start?: string; end?: string }) =>
    update((d) => ({ ...d, standardSlots: d.standardSlots.map((s) => (s.id === id ? { ...s, ...p } : s)) }));

  return (
    <>
      <PageHead title="予約枠管理" sub="BASE-PLUSの予約可能な時間帯" />
      <DemoBar>
        アプリ内の予約枠の設定です。<OffBadge>ホームページ・Googleカレンダーとは未連携（ホームページの表示は変わりません）</OffBadge>
      </DemoBar>

      <div className="grid-2 section">
        <div className="stack-2">
          <section className="card stack-2" aria-labelledby="h-std">
            <div className="section-head" style={{ marginBottom: 0 }}>
              <h2 id="h-std">通常の予約枠</h2>
              {isDefault ? <span className="badge badge-ok">✓ 5枠（各60分・間10分）</span> : <span className="badge badge-warning">! 初期の5枠から変更されています</span>}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>枠</th>
                    <th>開始</th>
                    <th>終了</th>
                    <th>長さ・次まで</th>
                    <th>
                      <span className="sr-only">操作</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map((s, i) => {
                    const c = checks.find((x) => x.id === s.id)!;
                    return (
                      <tr key={s.id}>
                        <td>{i + 1}</td>
                        <td>
                          <input type="time" step={300} value={s.start} onChange={(e) => patchSlot(s.id, { start: e.target.value })} aria-label={`枠${i + 1}の開始`} style={{ minHeight: 32, padding: "2px 4px" }} />
                        </td>
                        <td>
                          <input type="time" step={300} value={s.end} onChange={(e) => patchSlot(s.id, { end: e.target.value })} aria-label={`枠${i + 1}の終了`} style={{ minHeight: 32, padding: "2px 4px" }} />
                        </td>
                        <td className="xs">
                          {c.length}分{c.gapToNext !== null && ` ／ 次まで${c.gapToNext}分`}
                          {c.problem && <div style={{ color: "var(--danger)" }}>⚠ {c.problem}</div>}
                        </td>
                        <td>
                          <button className="btn btn-sm btn-ghost" onClick={() => confirm(`枠${i + 1}（${s.start}〜${s.end}）を削除しますか？\n（既存の予約は変更されません）`) && update((d) => ({ ...d, standardSlots: d.standardSlots.filter((x) => x.id !== s.id) }), "枠を削除しました")}>
                            削除
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="row">
              <button className="btn btn-sm" onClick={() => update((d) => ({ ...d, standardSlots: [...d.standardSlots, { id: newId("std"), start: "22:00", end: "23:00" }] }), "枠を追加しました")}>
                ＋ 枠を追加
              </button>
              {!isDefault && (
                <button className="btn btn-sm btn-ghost" onClick={() => confirm("通常枠を初期の5枠に戻しますか？\n（既存の予約は変更されません）") && update((d) => ({ ...d, standardSlots: DEFAULT_STANDARD_SLOTS.map((x) => ({ ...x })) }), "初期の5枠に戻しました")}>
                  初期の5枠に戻す
                </button>
              )}
            </div>
            <p className="xs muted">枠を変えても、すでに入っている予約の時間は変更しません。</p>
          </section>

          <section className="card stack-2" aria-labelledby="h-weekday">
            <h2 id="h-weekday">曜日ごとの営業</h2>
            <p className="xs muted">営業する曜日はまだ決まっていないため「未設定」にしています。決まったら設定してください。</p>
            <div className="weekday-grid">
              {ORDER.map((wd) => {
                const v = data.weekdayOpen?.[wd] ?? null;
                return (
                  <label key={wd} className="field">
                    {weekdayLabel(wd)}曜
                    <select
                      value={v === null ? "" : v ? "open" : "closed"}
                      onChange={(e) =>
                        update((d) => {
                          const w = [...(d.weekdayOpen ?? [null, null, null, null, null, null, null])];
                          w[wd] = e.target.value === "" ? null : e.target.value === "open";
                          return { ...d, weekdayOpen: w };
                        }, `${weekdayLabel(wd)}曜日を更新しました`)
                      }
                    >
                      <option value="">？ 未設定</option>
                      <option value="open">○ 営業</option>
                      <option value="closed">× 休み</option>
                    </select>
                  </label>
                );
              })}
            </div>
          </section>

          <section className="card stack-2" aria-labelledby="h-ex">
            <h2 id="h-ex">日ごとの例外</h2>
            <ul className="list small">
              {data.slotExceptions.length === 0 && (
                <li style={{ padding: 12 }} className="muted">
                  登録はありません
                </li>
              )}
              {[...data.slotExceptions]
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((x) => {
                  const s = slots.find((y) => y.id === x.slotId);
                  return (
                    <li key={x.id} className="row" style={{ padding: "8px 16px", justifyContent: "space-between" }}>
                      <span>
                        <span className={`badge ${x.type === "extra" ? "badge-ok" : "badge-danger"}`}>{x.type === "closed" ? "× 終日休み" : x.type === "slot_closed" ? "× 枠を休み" : "＋ 臨時枠"}</span> {formatDate(x.date)}
                        {x.type === "extra" && ` ${x.start}〜${x.end}`}
                        {x.type === "slot_closed" && ` ${s ? `${s.start}〜${s.end}` : "（削除された枠）"}`} {x.memo}
                      </span>
                      <button className="btn btn-sm btn-ghost" onClick={() => update((d) => ({ ...d, slotExceptions: d.slotExceptions.filter((y) => y.id !== x.id) }), "削除しました")}>
                        削除
                      </button>
                    </li>
                  );
                })}
            </ul>
            <div className="grid-2" style={{ gap: 8 }}>
              <label className="field">
                日付
                <input type="date" value={ex.date} onChange={(e) => setEx({ ...ex, date: e.target.value })} />
              </label>
              <label className="field">
                種類
                <select value={ex.type} onChange={(e) => setEx({ ...ex, type: e.target.value as SlotException["type"] })}>
                  <option value="closed">終日休み</option>
                  <option value="slot_closed">特定の枠だけ休み</option>
                  <option value="extra">臨時枠を追加</option>
                </select>
              </label>
              {ex.type === "slot_closed" && (
                <label className="field">
                  休みにする枠
                  <select value={ex.slotId} onChange={(e) => setEx({ ...ex, slotId: e.target.value })}>
                    {slots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.start}〜{s.end}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {ex.type === "extra" && (
                <>
                  <label className="field">
                    開始
                    <input type="time" step={300} value={ex.start} onChange={(e) => setEx({ ...ex, start: e.target.value })} />
                  </label>
                  <label className="field">
                    終了
                    <input type="time" step={300} value={ex.end} onChange={(e) => setEx({ ...ex, end: e.target.value })} />
                  </label>
                </>
              )}
              <label className="field">
                メモ
                <input type="text" value={ex.memo} onChange={(e) => setEx({ ...ex, memo: e.target.value })} />
              </label>
            </div>
            <div>
              <button
                className="btn btn-sm btn-primary"
                disabled={!ex.date || (ex.type === "slot_closed" && !ex.slotId) || (ex.type === "extra" && !(ex.start && ex.end && ex.start < ex.end))}
                onClick={() => update((d) => ({ ...d, slotExceptions: [...d.slotExceptions, { ...ex, slotId: ex.type === "slot_closed" ? ex.slotId : undefined, id: newId("x") }] }), "例外を登録しました")}
              >
                登録する
              </button>
            </div>
          </section>
        </div>

        <section className="stack-2" aria-labelledby="h-preview">
          <h2 id="h-preview">今後2週間の予約状況</h2>
          <div className="legend">
            {(Object.keys(STATE) as SlotState[]).map((k) => (
              <span key={k} className={`badge ${STATE[k].cls}`}>
                {STATE[k].icon} {STATE[k].label}
              </span>
            ))}
          </div>
          <ul className="list small">
            {days.map((d) => {
              const p = dayPlan(data, d);
              return (
                <li key={d} style={{ padding: "8px 16px" }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong style={{ color: weekdayOf(d) === 0 ? "#b3261e" : undefined }}>{formatDate(d)}</strong>
                    {p.closedAllDay ? (
                      <span className="badge badge-danger">× 終日休み {p.closedAllDay}</span>
                    ) : p.weekdayOpen === null ? (
                      <span className="badge badge-off">? 曜日の営業 未設定</span>
                    ) : p.weekdayOpen ? (
                      <span className="badge badge-ok">○ 営業日</span>
                    ) : (
                      <span className="badge badge-danger">× 休みの曜日</span>
                    )}
                  </div>
                  <div className="row xs" style={{ gap: 4, marginTop: 4 }}>
                    {p.slots.map((s) => (
                      <span key={s.key} className={`badge ${STATE[s.state].cls}`} title={s.bookings.map((b) => targetName(data, b.target)).join("、")}>
                        {STATE[s.state].icon} {s.label}
                        {s.state === "booked" && `：${s.bookings.map((b) => targetName(data, b.target).replace("（架空）", "")).join("、")}`}
                      </span>
                    ))}
                  </div>
                  {p.outside.map((b) => (
                    <div key={b.id} className="xs" style={{ marginTop: 4 }}>
                      <span className="badge badge-warning">
                        ! 枠外の予定 {formatTime(b.start)}〜{formatTime(b.end)} {targetName(data, b.target).replace("（架空）", "")}
                      </span>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
          <p className="xs muted">予約が枠と少しでも重なると「予約済み」になります。既存の予約時間は変更していないため、枠と時刻がずれている予定は「枠外」と表示されることがあります。</p>
        </section>
      </div>

      {data.weeklySlots.length > 0 && (
        <details className="record section">
          <summary>
            <strong>第2版までの曜日別の枠（参照のみ・現在は使用していません）</strong>
          </summary>
          <div className="record-body">
            <p className="xs muted" style={{ marginBottom: 8 }}>
              保存済みデータを消さないため残しています。現在の予約状況の計算には使っていません。
            </p>
            <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>
              {ORDER.flatMap((wd) =>
                data.weeklySlots
                  .filter((s) => s.weekday === wd)
                  .map((s) => (
                    <li key={s.id}>
                      {weekdayLabel(wd)}曜 {s.start}〜{s.end}（{s.label}）
                    </li>
                  )),
              )}
            </ul>
          </div>
        </details>
      )}

      <section className="card section stack" aria-labelledby="h-hp">
        <h2 id="h-hp">ホームページとの連携（調査結果の要点）</h2>
        <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>
          <li>ホームページの空き状況は、ホームページ内の読み取り専用の仕組み（/api/availability）から表示されています。</li>
          <li>
            ホームページの時間枠も <strong>16:10・17:20・18:30・19:40・20:50 の5枠</strong>で、開始時刻はこのアプリの通常枠と同じです（ホームページの表示は「16:10〜17:20」のように次の枠の開始までを表示）。
          </li>
          <li>外部からの書き込み方法は公開されておらず、管理画面はChatGPT（OpenAI）アカウントのログインが必要です。予約枠のデータの保存場所は、ソースコードを確認できないため不明です。</li>
          <li>新規顧客は申込フォームで受け付けている運用です。ただし公開ページからは申込フォームへのリンクを確認できていません（ページの文言はInstagramのDMを案内しています）。フォームのURL・設定は未確認です。</li>
        </ul>
        <p className="xs muted">詳しくは docs/ホームページ連携調査.md を参照してください。ホームページ・管理画面には一切変更を加えていません。</p>
      </section>
    </>
  );
}
