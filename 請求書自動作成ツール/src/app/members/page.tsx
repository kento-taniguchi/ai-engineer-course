"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { COPAY_RATIOS, TIME_SLOT_ORDER, TIME_SLOTS, WEEKDAY_LABELS, WEEKDAY_ORDER } from "@/config";
import { unitPriceFor, yen } from "@/lib/billing";
import { formatDateLong, formatMonth, isDateKey, isMonthKey, monthOf, todayKey } from "@/lib/dates";
import {
  changeCopay, changeSchedule, compareMembers, copayRatioFor, createMember, currentSlot, currentWeekdays, isWithdrawnOn, renameMember,
  restoreMember, upcomingCopays, upcomingSchedules, withdrawMember,
} from "@/lib/members";
import type { CopayRatio, Member, TimeSlot } from "@/lib/types";
import { getRepository } from "@/services/repository";
import { currentSpreadsheetId, spreadsheetUrl } from "@/services/sheetsRepository";

const repo = getRepository();
const wdText = (w: number[]) => [...w].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((n) => WEEKDAY_LABELS[n]).join("・");
const slotText = (slot: TimeSlot | undefined) => TIME_SLOTS[slot ?? "am"].label;

export default function MembersPage() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [mode, setMode] = useState<{ kind: "list" } | { kind: "new" } | { kind: "edit"; id: string }>({ kind: "list" });
  const [showWithdrawn, setShowWithdrawn] = useState(false);
  const [toast, setToast] = useState("");

  const reload = useCallback(async () => setMembers(await repo.listMembers()), []);
  useEffect(() => {
    reload();
  }, [reload]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  if (!members) return null;
  const today = todayKey();

  const saveMember = async (m: Member, msg: string) => {
    await repo.saveMember(m);
    await reload();
    setToast(msg);
  };

  if (mode.kind === "new") {
    return (
      <>
        <NewMemberForm
          onCancel={() => setMode({ kind: "list" })}
          onSave={async (input) => {
            const m = createMember(members, input);
            await saveMember(m, `${m.name} さんを登録しました（${m.id}）`);
            setMode({ kind: "list" });
          }}
        />
        {toast && <div className="toast" role="status">{toast}</div>}
      </>
    );
  }

  if (mode.kind === "edit") {
    const m = members.find((x) => x.id === mode.id);
    if (m)
      return (
        <>
          <EditMember member={m} today={today} onBack={() => setMode({ kind: "list" })} onSave={saveMember} />
          {toast && <div className="toast" role="status">{toast}</div>}
        </>
      );
  }

  const list = members.filter((m) => showWithdrawn || !isWithdrawnOn(m, today)).sort(compareMembers);
  const activeCount = members.filter((m) => !isWithdrawnOn(m, today)).length;

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>会員管理</h1>
        <span className="muted">利用中 {activeCount}名</span>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setMode({ kind: "new" })}>
          ＋ 新しく登録
        </button>
      </div>
      <label className="row small" style={{ marginBottom: 8 }}>
        <input type="checkbox" checked={showWithdrawn} onChange={(e) => setShowWithdrawn(e.target.checked)} />
        退会した方も表示
      </label>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>氏名</th>
              <th>利用曜日</th>
              <th>時間帯</th>
              <th>負担割合</th>
              <th>状態</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((m) => {
              const up = upcomingSchedules(m, today);
              const withdrawn = isWithdrawnOn(m, today);
              return (
                <tr key={m.id}>
                  <td>
                    {m.name}
                    <div className="muted small">{m.id}</div>
                  </td>
                  <td>
                    {wdText(currentWeekdays(m, today))}
                    {up.map((s) => (
                      <div key={s.from} className="small muted">
                        {formatDateLong(s.from)}から {wdText(s.weekdays)}（{slotText(s.slot)}）
                      </div>
                    ))}
                  </td>
                  <td>
                    {slotText(currentSlot(m, today))}
                    <div className="small muted">{TIME_SLOTS[currentSlot(m, today)].time}</div>
                  </td>
                  <td>
                    {copayRatioFor(m, monthOf(today))}割
                    {upcomingCopays(m, monthOf(today)).map((c) => (
                      <div key={c.from} className="small muted">
                        {formatMonth(c.from)}分から {c.ratio}割
                      </div>
                    ))}
                  </td>
                  <td>
                    {withdrawn ? (
                      <span className="status-pill withdrawn">退会</span>
                    ) : (
                      <span className="status-pill active">利用中</span>
                    )}
                    {m.withdrawnOn && !withdrawn && <div className="small muted">{formatDateLong(m.withdrawnOn)}に退会予定</div>}
                  </td>
                  <td className="num">
                    <button className="btn btn-small" onClick={() => setMode({ kind: "edit", id: m.id })}>
                      編集
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <DataTools onChanged={reload} onToast={setToast} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="wd-picker" role="group" aria-label="利用曜日">
      {WEEKDAY_ORDER.map((n) => {
        const on = value.includes(n);
        return (
          <button
            key={n}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== n) : [...value, n])}
          >
            {WEEKDAY_LABELS[n]}
          </button>
        );
      })}
    </div>
  );
}

/** 時間帯（午前・午後）を選ぶボタン */
function SlotPicker({ value, onChange }: { value: TimeSlot; onChange: (v: TimeSlot) => void }) {
  return (
    <div className="ratio-picker" role="group" aria-label="時間帯">
      {TIME_SLOT_ORDER.map((k) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>
          {TIME_SLOTS[k].label}
          <span className="price">{TIME_SLOTS[k].time}</span>
        </button>
      ))}
    </div>
  );
}

/** 介護保険の負担割合を選ぶボタン（1回あたりの金額も表示） */
function RatioPicker({ value, onChange, ym }: { value: CopayRatio; onChange: (v: CopayRatio) => void; ym: string }) {
  return (
    <div className="ratio-picker" role="group" aria-label="介護保険の負担割合">
      {COPAY_RATIOS.map((r) => (
        <button key={r} type="button" aria-pressed={value === r} onClick={() => onChange(r)}>
          {r}割<span className="price">1回 {yen(unitPriceFor(ym, r))}</span>
        </button>
      ))}
    </div>
  );
}

function NewMemberForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (input: { name: string; kana: string; weekdays: number[]; from: string; copayRatio: CopayRatio; slot: TimeSlot }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [copayRatio, setCopayRatio] = useState<CopayRatio>(1);
  const [kana, setKana] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [slot, setSlot] = useState<TimeSlot>("am");
  const [from, setFrom] = useState(todayKey());
  const [error, setError] = useState("");
  const submit = async () => {
    try {
      if (!isDateKey(from)) throw new Error("利用開始日を選んでください");
      await onSave({ name, kana, weekdays, from, copayRatio, slot });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="card">
      <h2>新しく登録</h2>
      <div className="form-grid">
        <div>
          <label className="label" htmlFor="nm">氏名</label>
          <input id="nm" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="kn">ふりがな（並び順に使用・任意）</label>
          <input id="kn" className="input" value={kana} onChange={(e) => setKana(e.target.value)} />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <span className="label">利用曜日</span>
        <WeekdayPicker value={weekdays} onChange={setWeekdays} />
      </div>
      <div style={{ marginTop: 12 }}>
        <span className="label">時間帯</span>
        <SlotPicker value={slot} onChange={setSlot} />
      </div>
      <div style={{ marginTop: 12 }}>
        <span className="label">介護保険の負担割合</span>
        <RatioPicker value={copayRatio} onChange={setCopayRatio} ym={isDateKey(from) ? monthOf(from) : monthOf(todayKey())} />
      </div>
      <div style={{ marginTop: 12, maxWidth: 240 }}>
        <label className="label" htmlFor="fr">利用開始日</label>
        <input id="fr" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      {error && <p style={{ color: "#8a2c2c", fontWeight: 600 }}>{error}</p>}
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn btn-primary" onClick={submit}>登録する</button>
        <button className="btn" onClick={onCancel}>やめる</button>
      </div>
    </div>
  );
}

function EditMember({
  member: m,
  today,
  onBack,
  onSave,
}: {
  member: Member;
  today: string;
  onBack: () => void;
  onSave: (m: Member, msg: string) => Promise<void>;
}) {
  const [name, setName] = useState(m.name);
  const [kana, setKana] = useState(m.kana);
  const [weekdays, setWeekdays] = useState<number[]>(currentWeekdays(m, today));
  const [slot, setSlot] = useState<TimeSlot>(currentSlot(m, today));
  const [from, setFrom] = useState(today);
  const [withdrawOn, setWithdrawOn] = useState(today);
  const thisMonth = monthOf(today);
  const [ratio, setRatio] = useState<CopayRatio>(copayRatioFor(m, thisMonth));
  const [ratioFrom, setRatioFrom] = useState(thisMonth);
  const [error, setError] = useState("");
  const run = async (fn: () => Promise<void>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const nameChanged = name.trim() !== m.name || kana.trim() !== m.kana;
  const sorted = [...m.schedules].sort((a, b) => a.from.localeCompare(b.from));
  const copayHistory = [...m.copays].sort((a, b) => a.from.localeCompare(b.from));

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn" onClick={onBack}>◀ 一覧に戻る</button>
        <h1 style={{ margin: 0 }}>{m.name}</h1>
        <span className="muted">{m.id}</span>
        {m.withdrawnOn && isWithdrawnOn(m, today) && <span className="status-pill withdrawn">退会</span>}
      </div>
      {error && <div className="notice">{error}</div>}

      <div className="card">
        <h2>氏名</h2>
        <div className="form-grid">
          <div>
            <label className="label" htmlFor="enm">氏名</label>
            <input id="enm" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="ekn">ふりがな（任意）</label>
            <input id="ekn" className="input" value={kana} onChange={(e) => setKana(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button
            className="btn btn-primary"
            disabled={!nameChanged}
            onClick={() => run(() => onSave(renameMember(m, name, kana), "氏名を変更しました"))}
          >
            氏名を保存
          </button>
        </div>
      </div>

      <div className="card section">
        <h2>利用曜日・時間帯の変更</h2>
        <div className="small muted" style={{ marginBottom: 8 }}>
          現在：{wdText(currentWeekdays(m, today))}（{slotText(currentSlot(m, today))}）
        </div>
        <WeekdayPicker value={weekdays} onChange={setWeekdays} />
        <div style={{ marginTop: 12 }}>
          <span className="label">時間帯</span>
          <SlotPicker value={slot} onChange={setSlot} />
        </div>
        <div style={{ marginTop: 12, maxWidth: 240 }}>
          <label className="label" htmlFor="efr">この日から変更</label>
          <input id="efr" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div style={{ marginTop: 12 }}>
          <button
            className="btn btn-primary"
            onClick={() =>
              run(async () => {
                if (!isDateKey(from)) throw new Error("変更する日を選んでください");
                const later = m.schedules.filter((s) => s.from > from);
                if (later.length && !window.confirm(`${later.map((s) => formatDateLong(s.from)).join("、")}からの変更予定は取り消されます。よろしいですか？`)) return;
                await onSave(
                  changeSchedule(m, weekdays, from, undefined, slot),
                  `${formatDateLong(from)}から ${wdText(weekdays)}（${slotText(slot)}） に変更しました`,
                );
              })
            }
          >
            曜日・時間帯を変更する
          </button>
        </div>
        <div className="small" style={{ marginTop: 16 }}>
          <span className="label">これまでの設定</span>
          <ul className="history">
            {sorted.map((s) => (
              <li key={s.from}>
                {formatDateLong(s.from)}から：{wdText(s.weekdays)}（{slotText(s.slot)}）
              </li>
            ))}
          </ul>
          <div className="muted">保存済みの出欠記録は、曜日・時間帯を変更しても書き換わりません。</div>
        </div>
      </div>

      <div className="card section">
        <h2>介護保険の負担割合</h2>
        <div className="small muted" style={{ marginBottom: 8 }}>
          今月（{formatMonth(thisMonth)}分）：{copayRatioFor(m, thisMonth)}割（1回 {yen(unitPriceFor(thisMonth, copayRatioFor(m, thisMonth)))}）
        </div>
        <RatioPicker value={ratio} onChange={setRatio} ym={isMonthKey(ratioFrom) ? ratioFrom : thisMonth} />
        <div style={{ marginTop: 12, maxWidth: 240 }}>
          <label className="label" htmlFor="rfr">何月分から変更</label>
          <input id="rfr" type="month" className="input" value={ratioFrom} onChange={(e) => setRatioFrom(e.target.value)} />
        </div>
        <div style={{ marginTop: 12 }}>
          <button
            className="btn btn-primary"
            onClick={() =>
              run(async () => {
                if (!isMonthKey(ratioFrom)) throw new Error("何月分から変更するかを選んでください");
                const later = m.copays.filter((c) => c.from > ratioFrom);
                if (later.length && !window.confirm(`${later.map((c) => formatMonth(c.from)).join("、")}分からの変更予定は取り消されます。よろしいですか？`)) return;
                await onSave(changeCopay(m, ratio, ratioFrom), `${formatMonth(ratioFrom)}分から ${ratio}割 に変更しました`);
              })
            }
          >
            負担割合を変更する
          </button>
        </div>
        <div className="small" style={{ marginTop: 16 }}>
          <span className="label">これまでの設定</span>
          <ul className="history">
            {copayHistory.map((c) => (
              <li key={c.from}>
                {formatMonth(c.from)}分から：{c.ratio}割
              </li>
            ))}
          </ul>
          <div className="muted">変更した月より前の請求額は変わりません。</div>
        </div>
      </div>

      <div className="card section">
        <h2>退会</h2>
        {m.withdrawnOn ? (
          <>
            <p>{formatDateLong(m.withdrawnOn)}から退会扱いです（それまでの記録・請求データは残っています）。</p>
            <button className="btn" onClick={() => run(() => onSave(restoreMember(m), `${m.name} さんを利用中に戻しました`))}>
              利用中に戻す
            </button>
          </>
        ) : (
          <>
            <div style={{ maxWidth: 240 }}>
              <label className="label" htmlFor="wd">退会日（この日から予定に表示しない）</label>
              <input id="wd" type="date" className="input" value={withdrawOn} onChange={(e) => setWithdrawOn(e.target.value)} />
            </div>
            <div style={{ marginTop: 12 }}>
              <button
                className="btn btn-danger"
                onClick={() =>
                  run(async () => {
                    if (!isDateKey(withdrawOn)) throw new Error("退会日を選んでください");
                    if (!window.confirm(`${m.name} さんを ${formatDateLong(withdrawOn)} から退会扱いにします。よろしいですか？`)) return;
                    await onSave(withdrawMember(m, withdrawOn), `${m.name} さんを退会扱いにしました`);
                  })
                }
              >
                退会扱いにする
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function DataTools({ onChanged, onToast }: { onChanged: () => Promise<void>; onToast: (s: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const exportData = async () => {
    const data = await repo.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `利用記録バックアップ_${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importData = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (!window.confirm("今のデータを、このファイルの内容で置き換えます。よろしいですか？")) return;
      await repo.importAll(data);
      await onChanged();
      onToast("読み込みました");
    } catch (e) {
      window.alert(`読み込めませんでした：${e instanceof Error ? e.message : e}`);
    }
  };
  return (
    <details className="section">
      <summary className="muted small" style={{ cursor: "pointer" }}>データのバックアップ（{repo.label}に保存中）</summary>
      {repo.kind === "sheets" && currentSpreadsheetId() && (
        <p className="small" style={{ margin: "8px 0 0" }}>
          <a href={spreadsheetUrl(currentSpreadsheetId()!)} target="_blank" rel="noopener noreferrer">データのスプレッドシートを開く</a>
          <span className="muted">（見るだけにしてください。間違えて変えたときは「ファイル」→「変更履歴」で戻せます）</span>
        </p>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn btn-small" onClick={exportData}>書き出し</button>
        <button className="btn btn-small" onClick={() => fileRef.current?.click()}>読み込み</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importData(f);
            e.target.value = "";
          }}
        />
        {repo.kind === "local" && (
          <button
            className="btn btn-small btn-danger"
            onClick={async () => {
              if (!window.confirm("すべてのデータを消して、架空のデモデータに戻します。よろしいですか？")) return;
              await repo.resetToDemo();
              await onChanged();
              onToast("デモデータに戻しました");
            }}
          >
            デモデータに戻す
          </button>
        )}
      </div>
    </details>
  );
}
