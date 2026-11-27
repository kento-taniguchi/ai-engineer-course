"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  absentRows, addableMembers, buildDayRows, countStatuses, draftFromRecord, groupBySlot, isDirty, markAllPresent, statusOf,
  toRecord, type DayRow, type Draft,
} from "@/lib/attendance";
import { TIME_SLOT_ORDER, TIME_SLOTS } from "@/config";
import { formatDateLong, formatDateTime, isDateKey, todayKey } from "@/lib/dates";
import type { AttendanceStatus, DayRecord, Member } from "@/lib/types";
import { getRepository } from "@/services/repository";
import { confirmLeave, setUnsaved, UNSAVED_MESSAGE } from "@/components/unsaved";

const repo = getRepository();

const STATUS_TEXT: Record<AttendanceStatus, string> = { present: "利用", absent: "欠席", unconfirmed: "未確認" };

export default function AttendancePage() {
  const [date, setDate] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [saved, setSaved] = useState<DayRecord | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [extras, setExtras] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [addId, setAddId] = useState("");
  /** 「全員利用」で欠席の方がいたときの確認（対象の行） */
  const [confirmAll, setConfirmAll] = useState<DayRow[] | null>(null);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    const [ms, rec] = await Promise.all([repo.listMembers(), repo.getDay(d)]);
    setMembers(ms);
    setSaved(rec);
    setDraft(draftFromRecord(rec));
    setExtras([]);
    setAddId("");
    setDate(d);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(todayKey());
  }, [load]);

  const rows = useMemo(() => (date ? buildDayRows(members, date, saved, extras) : []), [members, date, saved, extras]);
  const addable = useMemo(() => (date ? addableMembers(members, rows, date) : []), [members, rows, date]);
  const dirty = !loading && isDirty(saved, rows, draft);
  const counts = countStatuses(rows, draft);
  const groups = useMemo(() => groupBySlot(rows, date, TIME_SLOT_ORDER), [rows, date]);

  useEffect(() => {
    setUnsaved(dirty);
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = UNSAVED_MESSAGE;
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  useEffect(() => () => setUnsaved(false), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const changeDate = (d: string) => {
    if (!isDateKey(d) || d === date) return;
    if (!confirmLeave()) return;
    load(d);
  };

  const choose = (memberId: string, s: AttendanceStatus) => {
    // 選択中のボタンをもう一度押すと「未確認」に戻る
    setDraft((cur) => ({ ...cur, [memberId]: statusOf(cur, memberId) === s ? "unconfirmed" : s }));
  };

  /** target：対象の行（全員、または午前・午後のどちらか） */
  const onAllPresent = (target: DayRow[]) => {
    if (absentRows(draft, target).length > 0) setConfirmAll(target);
    else setDraft((cur) => markAllPresent(cur, target, false));
  };

  const addMember = () => {
    if (!addId) return;
    setExtras((cur) => [...cur, addId]);
    setAddId("");
  };

  const removeExtra = (id: string) => {
    setExtras((cur) => cur.filter((x) => x !== id));
    setDraft((cur) => {
      const next = { ...cur };
      delete next[id];
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const rec = toRecord(date, rows, draft);
      await repo.saveDay(rec);
      setSaved(rec);
      setExtras([]);
      setToast("保存しました");
    } catch (e) {
      window.alert(`保存できませんでした：${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  };

  const absent = confirmAll ? absentRows(draft, confirmAll) : [];

  return (
    <>
      <div className="date-bar">
        <input
          type="date"
          className="input date-input"
          aria-label="日付"
          value={date}
          onChange={(e) => changeDate(e.target.value)}
        />
        {date && <span className="date-label">{formatDateLong(date)}</span>}
      </div>

      {!loading && (
        <>
          <div className="toolbar">
            <button className="btn btn-primary" onClick={() => onAllPresent(rows)} disabled={rows.length === 0}>
              全員利用
            </button>
            <div className="counts" aria-live="polite">
              <span>利用 <b>{counts.present}</b></span>
              <span>欠席 <b>{counts.absent}</b></span>
              <span className={counts.unconfirmed ? "muted" : ""}>未確認 <b>{counts.unconfirmed}</b></span>
            </div>
            <div className="spacer" />
            <div className="add-box">
              <select className="select" value={addId} onChange={(e) => setAddId(e.target.value)} aria-label="追加する会員">
                <option value="">振替・追加の会員を選ぶ</option>
                {addable.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}（{m.id}）
                  </option>
                ))}
              </select>
              <button className="btn" onClick={addMember} disabled={!addId}>
                追加
              </button>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="card empty">この日の利用予定者はいません。振替・追加の会員を選んで追加できます。</div>
          ) : (
            groups.map((g) => {
              const c = countStatuses(g.rows, draft);
              return (
                <section key={g.slot} className="slot-group">
                  <div className="slot-head">
                    <h2>
                      {TIME_SLOTS[g.slot].label}
                      <span className="slot-time">{TIME_SLOTS[g.slot].time}</span>
                    </h2>
                    <span className="muted small">
                      {g.rows.length}名（利用 {c.present}・欠席 {c.absent}・未確認 {c.unconfirmed}）
                    </span>
                    <div className="spacer" />
                    {groups.length > 1 && (
                      <button className="btn btn-small" onClick={() => onAllPresent(g.rows)}>
                        {TIME_SLOTS[g.slot].label}を全員利用
                      </button>
                    )}
                  </div>
                <ul className="att-list">
                  {g.rows.map((r) => {
                    const s = statusOf(draft, r.member.id);
                    const unsavedExtra = extras.includes(r.member.id);
                    return (
                      <li key={r.member.id} className="att-row">
                        <div className="att-name">
                          <span className="name">{r.member.name}</span>
                          {r.added && <span className="tag">追加</span>}
                          <div className="sub">
                            {r.member.id}
                            {unsavedExtra && (
                              <button className="remove-btn" onClick={() => removeExtra(r.member.id)}>
                                追加を取り消す
                              </button>
                            )}
                          </div>
                        </div>
                        <span className={`state-label ${s}`}>{STATUS_TEXT[s]}</span>
                        <div className="seg" role="group" aria-label={`${r.member.name}の出欠`}>
                          <button
                            className={s === "present" ? "on-present" : ""}
                            aria-pressed={s === "present"}
                            onClick={() => choose(r.member.id, "present")}
                          >
                            {s === "present" ? "✓ 利用" : "利用"}
                          </button>
                          <button
                            className={s === "absent" ? "on-absent" : ""}
                            aria-pressed={s === "absent"}
                            onClick={() => choose(r.member.id, "absent")}
                          >
                            {s === "absent" ? "✓ 欠席" : "欠席"}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                </section>
              );
            })
          )}

          <div className="save-bar">
            <div className="save-bar-inner">
              <span className={`save-state ${dirty ? "dirty" : saved ? "saved" : "muted"}`}>
                {dirty
                  ? "● 未保存の変更があります"
                  : saved
                    ? `保存済み（${formatDateTime(saved.savedAt)}）`
                    : "この日はまだ保存していません"}
              </span>
              <button className="btn btn-primary" onClick={save} disabled={saving || (!dirty && !!saved) || rows.length === 0}>
                保存
              </button>
            </div>
          </div>
        </>
      )}

      {confirmAll && (
        <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
          <div className="dialog">
            <h2 id="dlg-title">欠席の方がいます</h2>
            <p>
              {absent.map((r) => r.member.name).join("、")} さんが「欠席」になっています。
            </p>
            <div className="actions">
              <button
                className="btn btn-primary"
                onClick={() => {
                  setDraft((cur) => markAllPresent(cur, confirmAll, false));
                  setConfirmAll(null);
                }}
              >
                欠席の方はそのまま、他を利用にする
              </button>
              <button
                className="btn"
                onClick={() => {
                  setDraft((cur) => markAllPresent(cur, confirmAll, true));
                  setConfirmAll(null);
                }}
              >
                欠席の方も含めて全員利用にする
              </button>
              <button className="btn" onClick={() => setConfirmAll(null)}>
                やめる
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
