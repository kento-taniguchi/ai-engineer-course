"use client";

// フィードバック・レポート作成画面
//   /report?booking=予約ID   … 予約に紐づくレポート（既にあれば編集）
//   /report?id=レポートID     … 既存レポートの編集
//   /report?target=player:p1 … 予約に紐づかない記録の新規作成

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import type { Report, TargetRef } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { newId, reportOfBooking, targetHref, targetName } from "@/lib/selectors";
import { REPORT_FIELDS, reportText } from "@/lib/messages";
import { upsertReport } from "@/lib/operations";
import { bookingTodoId } from "@/lib/todoEngine";
import { dateKey, dateKeyOf, formatDateTime, formatRange, toISO } from "@/lib/time";
import { demoSpeechService, emptyReportFields, splitIntoFields, type FieldDraft, type FieldKey } from "@/services/feedbackAssist";
import { ShareBox } from "@/components/ShareBox";
import { DemoBadge, Empty, KindBadge } from "@/components/ui";

export default function ReportPage() {
  return (
    <Suspense>
      <ReportInner />
    </Suspense>
  );
}

function ReportInner() {
  const params = useSearchParams();
  const { data, now } = useApp();
  const bookingId = params.get("booking");
  const reportId = params.get("id");
  const targetParam = params.get("target");
  // 新規作成時のIDは画面を開いたときに1回だけ作る（再描画で変わると入力内容が消えるため）
  const [freshId] = useState(() => newId("rep"));

  let initial: Report | null = null;
  if (reportId) initial = data.reports.find((r) => r.id === reportId) ?? null;
  else if (bookingId) {
    const b = data.bookings.find((x) => x.id === bookingId);
    if (b?.target) {
      initial = reportOfBooking(data, b.id) ?? {
        id: freshId,
        bookingId: b.id,
        target: b.target,
        date: dateKeyOf(b.start),
        ...emptyReportFields(),
        createdAt: toISO(now),
        updatedAt: toISO(now),
      };
    }
  } else if (targetParam) {
    const [type, id] = targetParam.split(":") as [TargetRef["type"], string];
    initial = { id: freshId, target: { type, id }, date: dateKey(now), ...emptyReportFields(), createdAt: toISO(now), updatedAt: toISO(now) };
  }

  if (!initial) {
    return (
      <>
        <Link href="/" className="back-link">
          ← 今日の仕事
        </Link>
        <Empty>レポートの対象が見つかりません</Empty>
      </>
    );
  }
  return <ReportEditor key={initial.id} initial={initial} />;
}

function ReportEditor({ initial }: { initial: Report }) {
  const { data, update, notify } = useApp();
  const [r, setR] = useState<Report>(initial);
  const saved = data.reports.find((x) => x.id === r.id);
  const booking = r.bookingId ? data.bookings.find((b) => b.id === r.bookingId) : undefined;
  const dirty = !saved || REPORT_FIELDS.some((f) => saved[f.key] !== r[f.key]) || saved.date !== r.date;
  const sendTodoId = r.bookingId ? bookingTodoId(r.bookingId, "send_feedback") : null;
  const sendTodo = sendTodoId ? data.todos.find((t) => t.id === sendTodoId) : undefined;

  const set = (k: FieldKey, v: string) => setR((x) => ({ ...x, [k]: v }));

  const save = () => {
    update((d, n) => upsertReport(d, r, n), "レポートを保存しました");
  };

  return (
    <>
      <Link href={targetHref(r.target)} className="back-link">
        <span aria-hidden="true">←</span> {targetName(data, r.target)} の詳細
      </Link>
      <div className="page-head">
        <div>
          <h1>フィードバック・レポート</h1>
          <p className="sub">
            {targetName(data, r.target)}
            {booking && (
              <>
                {" "}
                ・ {formatRange(booking.start, booking.end)} <KindBadge kind={booking.kind} />
              </>
            )}
          </p>
        </div>
        <div className="row">
          {saved ? (
            <span className={`badge ${dirty ? "badge-warning" : "badge-ok"}`}>
              {dirty ? "! 未保存の変更あり" : `✓ 保存済み ${formatDateTime(saved.updatedAt)}`}
            </span>
          ) : (
            <span className="badge badge-warning">! 未保存（新規）</span>
          )}
        </div>
      </div>

      <VoiceDemo current={r} onApply={(fields) => setR((x) => mergeFields(x, fields))} />

      <div className="grid-2">
        <section className="stack-2" aria-labelledby="h-fields">
          <h2 id="h-fields">内容を入力・確認</h2>
          <div className="grid-2" style={{ gap: 16 }}>
            <label className="field">
              指導日
              <input type="date" value={r.date} onChange={(e) => setR({ ...r, date: e.target.value })} />
            </label>
            <div className="field">
              対象者
              <div style={{ minHeight: 40, display: "flex", alignItems: "center", fontWeight: 400 }}>{targetName(data, r.target)}</div>
            </div>
          </div>
          {REPORT_FIELDS.map((f) => (
            <label key={f.key} className="field">
              {f.label}
              <textarea value={r[f.key]} onChange={(e) => set(f.key, e.target.value)} style={{ minHeight: f.key === "content" ? 120 : 80 }} />
            </label>
          ))}
          <div className="row sticky-actions">
            <button className="btn btn-primary" onClick={save} disabled={!dirty}>
              {saved ? "変更を保存" : "保存する"}
            </button>
            {saved && (
              <Link href={targetHref(r.target)} className="btn">
                詳細で確認
              </Link>
            )}
          </div>
        </section>

        <section className="stack-2" aria-labelledby="h-preview">
          <h2 id="h-preview">プレビュー</h2>
          <div className="card pre small" style={{ minHeight: 200 }}>
            {reportText(data, r, booking)}
          </div>
          <p className="xs muted">未入力の項目はプレビューに表示されません（自動で補完しません）。</p>
          <ShareBox text={reportText(data, r, booking)} subject="BASE-PLUS フィードバック" />
          {sendTodo && saved && (
            <div className="card stack">
              <h3>フィードバック送信のToDo</h3>
              <p className="small">送信したら、送信画面で「送信済みにする」を押してください。</p>
              <div>
                <Link href={`/message?todo=${encodeURIComponent(sendTodo.id)}`} className="btn btn-gold" onClick={() => dirty && notify("未保存の変更があります。先に保存してください", "error")}>
                  送信画面へ →
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/** 空欄の項目には入れ、入力済みの項目には追記する */
function mergeFields(r: Report, fields: FieldDraft): Report {
  const next = { ...r };
  for (const [k, v] of Object.entries(fields) as [FieldKey, string][]) {
    if (!v) continue;
    next[k] = next[k].trim() ? `${next[k]}\n${v}` : v;
  }
  return next;
}

function VoiceDemo({ current, onApply }: { current: Report; onApply: (f: FieldDraft) => void }) {
  const { notify } = useApp();
  const [transcript, setTranscript] = useState("");
  const [recording, setRecording] = useState(false);
  const [proposal, setProposal] = useState<{ fields: FieldDraft; unassigned: string[] } | null>(null);

  return (
    <details className="record section">
      <summary>
        <strong>音声から下書きを作る</strong> <DemoBadge>デモ・音声認識/AI未接続</DemoBadge>
      </summary>
      <div className="record-body stack-2">
        <p className="small muted">
          試作版ではマイクを使わず、サンプル文章で動作を再現します。文章を直接貼り付けて試すこともできます。
        </p>
        <div className="row">
          <button
            className="btn"
            disabled={recording}
            onClick={async () => {
              setRecording(true);
              const t = await demoSpeechService.transcribe();
              setTranscript(t);
              setRecording(false);
              notify("サンプル文章を表示しました（デモ）", "info");
            }}
          >
            {recording ? "◉ 文字起こし中…（デモ）" : "● 録音して文字起こし（デモ）"}
          </button>
        </div>
        <label className="field">
          文字起こしの文章
          <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="ここに文章を入力・貼り付けできます" />
        </label>
        <div>
          <button className="btn btn-primary" disabled={!transcript.trim()} onClick={() => setProposal(splitIntoFields(transcript))}>
            項目に振り分ける（デモ）
          </button>
        </div>
        {proposal && (
          <div className="card stack">
            <h3>振り分け結果（確認してから反映）</h3>
            <dl className="fields">
              {REPORT_FIELDS.map((f) => (
                <div key={f.key} style={{ display: "contents" }}>
                  <dt>{f.label}</dt>
                  <dd>
                    {proposal.fields[f.key] ? (
                      <>
                        {proposal.fields[f.key]}
                        {current[f.key].trim() && <span className="badge badge-info" style={{ marginLeft: 4 }}>入力済みの内容に追記</span>}
                      </>
                    ) : (
                      <span className="muted">（該当なし・空欄のまま）</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            {proposal.unassigned.length > 0 && (
              <p className="small">
                <strong>どの項目にも当てはまらなかった文：</strong>
                {proposal.unassigned.join(" ")}
              </p>
            )}
            <div className="row">
              <button
                className="btn btn-primary"
                onClick={() => {
                  onApply(proposal.fields);
                  setProposal(null);
                  notify("入力欄に反映しました。内容を確認して保存してください", "info");
                }}
              >
                入力欄に反映
              </button>
              <button className="btn" onClick={() => setProposal(null)}>
                やめる
              </button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
