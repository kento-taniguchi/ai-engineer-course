"use client";

// 選手・チーム詳細で共通に使う記録パネル

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Attachment, AttachmentKind, Measurement, Report, TargetRef } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { bookingsOf, newId, reportOfBooking, reportsOf, sameTarget } from "@/lib/selectors";
import { REPORT_FIELDS } from "@/lib/messages";
import { dateKey, formatDate, formatRange, toISO, dateKeyOf } from "@/lib/time";
import { LineChart } from "./charts";
import { PlanFields } from "./LessonPlanParts";
import { planOfBooking } from "@/lib/selectors";
import { DemoBadge, Empty, KindBadge } from "./ui";

// ---------- 前回の記録 ----------

export function LatestRecord({ target, beforeISO }: { target: TargetRef; beforeISO?: string }) {
  const { data } = useApp();
  const list = reportsOf(data, target);
  const prev = beforeISO ? list.find((r) => r.date < beforeISO.slice(0, 10)) : list[0];
  if (!prev) return <Empty>前回の記録がありません</Empty>;
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 8 }}>
        <strong>{formatDate(prev.date)} の記録</strong>
        <Link href={`/report?id=${prev.id}`} className="small">
          編集
        </Link>
      </div>
      <ReportFields report={prev} />
      <ReportAttachments reportId={prev.id} />
    </div>
  );
}

export function ReportFields({ report }: { report: Report }) {
  const filled = REPORT_FIELDS.filter((f) => report[f.key].trim());
  if (filled.length === 0) return <p className="small muted">入力された項目はありません</p>;
  return (
    <dl className="fields">
      {filled.map((f) => (
        <div key={f.key} style={{ display: "contents" }}>
          <dt>{f.label}</dt>
          <dd>{report[f.key]}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReportAttachments({ reportId }: { reportId: string }) {
  const { data } = useApp();
  const list = data.attachments.filter((a) => a.reportId === reportId);
  if (list.length === 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <p className="xs muted" style={{ marginBottom: 4 }}>
        この回の写真・動画
      </p>
      <div className="thumbs">
        {list.map((a) => (
          <Thumb key={a.id} a={a} />
        ))}
      </div>
    </div>
  );
}

// ---------- 指導履歴 ----------

export function LessonHistory({ target }: { target: TargetRef }) {
  const { data, now } = useApp();
  const bookings = bookingsOf(data, target, true)
    .filter((b) => new Date(b.start) <= now || b.status !== "scheduled")
    .reverse();
  const orphanReports = reportsOf(data, target).filter((r) => !r.bookingId || !data.bookings.some((b) => b.id === r.bookingId));
  if (bookings.length === 0 && orphanReports.length === 0) return <Empty>指導履歴はまだありません</Empty>;
  return (
    <div className="stack">
      {bookings.map((b) => {
        const r = reportOfBooking(data, b.id);
        const plan = planOfBooking(data, b.id);
        return (
          <details key={b.id} className="record">
            <summary>
              <strong>{formatRange(b.start, b.end)}</strong>
              <KindBadge kind={b.kind} />
              {b.status === "cancelled" && <span className="badge badge-off">キャンセル</span>}
              {b.status === "deleted" && <span className="badge badge-off">削除</span>}
              {b.status === "scheduled" &&
                (r ? <span className="badge badge-ok">✓ レポートあり</span> : <span className="badge badge-warning">! レポート未作成</span>)}
            </summary>
            <div className="record-body">
              {plan && (
                <div className="card" style={{ marginBottom: 12, background: "var(--navy-soft)" }}>
                  <p className="xs" style={{ fontWeight: 700, marginBottom: 4 }}>
                    指導前のメモ（今回の予定）
                  </p>
                  <PlanFields plan={plan} />
                </div>
              )}
              {r ? (
                <>
                  <ReportFields report={r} />
                  <ReportAttachments reportId={r.id} />
                  <div className="row" style={{ marginTop: 12 }}>
                    <Link href={`/report?id=${r.id}`} className="btn btn-sm">
                      編集・共有
                    </Link>
                  </div>
                </>
              ) : b.status === "scheduled" ? (
                <Link href={`/report?booking=${b.id}`} className="btn btn-sm btn-primary">
                  レポートを作成
                </Link>
              ) : (
                <p className="small muted">
                  {b.history[b.history.length - 1]?.detail}
                </p>
              )}
            </div>
          </details>
        );
      })}
      {orphanReports.map((r) => (
        <details key={r.id} className="record">
          <summary>
            <strong>{formatDate(r.date)}</strong>
            <span className="badge badge-ok">✓ レポート</span>
          </summary>
          <div className="record-body">
            <ReportFields report={r} />
            <Link href={`/report?id=${r.id}`} className="btn btn-sm" style={{ marginTop: 12 }}>
              編集・共有
            </Link>
          </div>
        </details>
      ))}
    </div>
  );
}

// ---------- 測定結果 ----------

const PRESET_ITEMS: { item: string; unit: string }[] = [
  { item: "球速", unit: "km/h" },
  { item: "体重", unit: "kg" },
  { item: "握力", unit: "kg" },
  { item: "垂直ジャンプ", unit: "cm" },
  { item: "20m走", unit: "秒" },
];

/** 項目名 + 単位 をキーにする（同じ項目名でも単位が違えば別のグラフ） */
function seriesKey(m: { item: string; unit: string }): string {
  return `${m.item}（${m.unit}）`;
}

export function MeasurementPanel({ target }: { target: TargetRef }) {
  const { data, update, now } = useApp();
  const list = data.measurements.filter((m) => sameTarget(m.target, target));
  const series = useMemo(() => {
    const map = new Map<string, Measurement[]>();
    for (const m of list) {
      const k = seriesKey(m);
      map.set(k, [...(map.get(k) ?? []), m]);
    }
    return map;
  }, [list]);
  const keys = [...series.keys()];
  const [selected, setSelected] = useState<string | null>(null);
  const current = selected && series.has(selected) ? selected : keys[0];
  const points = current ? series.get(current)! : [];

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ item: "球速", unit: "km/h", date: dateKey(now), value: "" });

  const save = () => {
    const value = Number(form.value);
    if (!form.item.trim() || !form.unit.trim() || form.value === "" || Number.isNaN(value)) return;
    const m: Measurement = { id: newId("m"), target, item: form.item.trim(), unit: form.unit.trim(), date: form.date, value };
    update((d) => ({ ...d, measurements: [...d.measurements, m] }), "測定結果を保存しました");
    setSelected(seriesKey(m));
    setForm((f) => ({ ...f, value: "" }));
    setAdding(false);
  };

  return (
    <div className="stack-2">
      {keys.length === 0 ? (
        <Empty>測定結果はまだありません</Empty>
      ) : (
        <>
          <div className="chip-group" role="group" aria-label="測定項目を選択">
            {keys.map((k) => (
              <button key={k} className="chip" aria-pressed={k === current} onClick={() => setSelected(k)}>
                {k}
              </button>
            ))}
          </div>
          {current && (
            <div className="card">
              <h3 style={{ marginBottom: 8 }}>{current}</h3>
              <LineChart points={points.map((p) => ({ date: p.date, value: p.value }))} unit={points[0].unit} label={points[0].item} />
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>測定日</th>
                      <th className="num">数値</th>
                      <th>単位</th>
                      <th>
                        <span className="sr-only">操作</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...points]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((p) => (
                        <tr key={p.id}>
                          <td>{formatDate(p.date)}</td>
                          <td className="num">{p.value}</td>
                          <td>{p.unit}</td>
                          <td className="num">
                            <button
                              className="btn btn-sm btn-ghost"
                              onClick={() => {
                                if (confirm(`${formatDate(p.date)} の ${p.item} ${p.value}${p.unit} を削除しますか？`))
                                  update((d) => ({ ...d, measurements: d.measurements.filter((x) => x.id !== p.id) }), "測定結果を削除しました");
                              }}
                            >
                              削除
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {adding ? (
        <div className="card stack-2">
          <h3>測定結果を追加</h3>
          <div className="chip-group" role="group" aria-label="よく使う項目">
            {PRESET_ITEMS.map((p) => (
              <button key={p.item} type="button" className="chip" aria-pressed={form.item === p.item && form.unit === p.unit} onClick={() => setForm((f) => ({ ...f, ...p }))}>
                {p.item}
              </button>
            ))}
          </div>
          <div className="grid-2" style={{ gap: 16 }}>
            <label className="field">
              項目
              <input type="text" value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} />
            </label>
            <label className="field">
              単位
              <input type="text" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </label>
            <label className="field">
              測定日
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label className="field">
              数値
              <input type="number" inputMode="decimal" step="any" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </label>
          </div>
          <div className="row">
            <button className="btn btn-primary" onClick={save} disabled={form.value === "" || !form.item.trim() || !form.unit.trim()}>
              保存する
            </button>
            <button className="btn" onClick={() => setAdding(false)}>
              閉じる
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button className="btn" onClick={() => setAdding(true)}>
            ＋ 測定結果を追加
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- 写真・動画 ----------

const KIND_LABEL: Record<AttachmentKind, string> = { photo: "写真", video: "動画", whiteboard: "ホワイトボード" };
const KIND_ICON: Record<AttachmentKind, string> = { photo: "▣", video: "▶", whiteboard: "▤" };

function Thumb({ a, onDelete }: { a: Attachment; onDelete?: () => void }) {
  return (
    <div className="thumb">
      <div className="thumb-img" aria-hidden="true">
        <span className="ic">{KIND_ICON[a.kind]}</span>
        <span>{a.dummy ? "ダミー" : "ファイル名のみ"}</span>
      </div>
      <div className="thumb-cap">
        <strong>{KIND_LABEL[a.kind]}</strong>：{a.label}
        {a.fileName && (
          <div className="muted">
            {a.fileName}（{Math.round((a.fileSize ?? 0) / 1024)}KB・未保存）
          </div>
        )}
        {onDelete && (
          <button className="btn btn-sm btn-ghost" onClick={onDelete} style={{ padding: 0, minHeight: 28 }}>
            削除
          </button>
        )}
      </div>
    </div>
  );
}

export function AttachmentsPanel({ target }: { target: TargetRef }) {
  const { data, update } = useApp();
  const list = data.attachments.filter((a) => sameTarget(a.target, target));
  const reports = reportsOf(data, target);
  const [kind, setKind] = useState<AttachmentKind>("photo");
  const [label, setLabel] = useState("");
  const [reportId, setReportId] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const add = () => {
    const a: Attachment = {
      id: newId("att"),
      target,
      reportId: reportId || undefined,
      kind,
      label: label.trim() || KIND_LABEL[kind],
      fileName: file?.name,
      fileSize: file?.size,
      dummy: !file,
      createdAt: toISO(new Date()),
    };
    update((d) => ({ ...d, attachments: [...d.attachments, a] }), file ? "ファイル名を記録しました（ファイル本体は保存していません）" : "ダミーを追加しました");
    setLabel("");
    setFile(null);
  };

  const groups = [
    ...reports.map((r) => ({ key: r.id, title: `${formatDate(r.date)} の記録`, items: list.filter((a) => a.reportId === r.id) })),
    { key: "none", title: "記録に紐づけていないもの", items: list.filter((a) => !a.reportId || !reports.some((r) => r.id === a.reportId)) },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="stack-2">
      <div className="notice notice-info">
        <DemoBadge /> 試作版では画像・動画の本体は保存しません（ブラウザ内の保存容量に限りがあるため）。ダミー表示と、選んだファイルの名前・サイズのみ記録します。
      </div>
      {groups.length === 0 ? (
        <Empty>写真・動画はまだありません</Empty>
      ) : (
        groups.map((g) => (
          <div key={g.key}>
            <p className="small" style={{ fontWeight: 700, marginBottom: 4 }}>
              {g.title}
            </p>
            <div className="thumbs">
              {g.items.map((a) => (
                <Thumb
                  key={a.id}
                  a={a}
                  onDelete={() => {
                    if (confirm(`「${a.label}」を削除しますか？`)) update((d) => ({ ...d, attachments: d.attachments.filter((x) => x.id !== a.id) }), "削除しました");
                  }}
                />
              ))}
            </div>
          </div>
        ))
      )}
      <details className="record">
        <summary>
          <strong>＋ 写真・動画を追加</strong>
        </summary>
        <div className="record-body stack-2">
          <div className="grid-2" style={{ gap: 16 }}>
            <label className="field">
              種類
              <select value={kind} onChange={(e) => setKind(e.target.value as AttachmentKind)}>
                <option value="photo">写真</option>
                <option value="video">動画</option>
                <option value="whiteboard">ホワイトボードの写真</option>
              </select>
            </label>
            <label className="field">
              紐づける指導記録
              <select value={reportId} onChange={(e) => setReportId(e.target.value)}>
                <option value="">紐づけない</option>
                {reports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {formatDate(r.date)} の記録
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              説明
              <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例：投球フォーム（横）" />
            </label>
            <label className="field">
              ファイル（任意・名前のみ記録）
              <input type="file" accept="image/*,video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <div>
            <button className="btn btn-primary" onClick={add}>
              {file ? "ファイル名を記録" : "ダミーを追加"}
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}

export function nextOrNone(iso?: string): string {
  return iso ? formatDate(dateKeyOf(iso)) : "予定なし";
}
