"use client";

import { useState } from "react";
import type { SeminarEpisode, SeminarStatus } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { addDaysKey, dateKey, formatDate, weekdayOf } from "@/lib/time";
import Link from "next/link";
import { DemoBar, OffBadge, PageHead } from "@/components/ui";
import { ThumbnailView } from "@/components/Media";
import { SEMINAR_STATUS } from "@/lib/seminar";
import { SeminarRulesEditor } from "@/components/SeminarRules";
import { ruleForEpisode, seminarTaskDate } from "@/lib/workTasks";
import type { AppData } from "@/lib/types";

function firstWorkLabel(data: AppData, ep: SeminarEpisode): string {
  const rule = ruleForEpisode(data.seminarRules ?? [], ep);
  if (!rule || rule.tasks.length === 0) return "準備作業のルールなし";
  const dates = [...new Set(rule.tasks.map((t) => seminarTaskDate(ep, t)))].sort();
  return `作業日：${dates.map((d) => formatDate(d)).join("・")}`;
}

const STATUS = SEMINAR_STATUS;

export default function SeminarPage() {
  const { data, now, update } = useApp();
  const today = dateKey(now);
  const [showPast, setShowPast] = useState(false);
  const [idea, setIdea] = useState(data.settings.seminarIdea);
  const list = [...data.seminars].sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate)).filter((e) => showPast || e.deliveryDate >= today || e.status !== "delivered");

  const patch = (id: string, p: Partial<SeminarEpisode>, msg?: string) =>
    update((d) => ({ ...d, seminars: d.seminars.map((s) => (s.id === id ? { ...s, ...p } : s)) }), msg);

  const addNext = () => {
    const last = [...data.seminars].sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate))[0];
    let d = addDaysKey(last ? last.deliveryDate : today, 1);
    while (![1, 5].includes(weekdayOf(d))) d = addDaysKey(d, 1);
    const ep: SeminarEpisode = { id: `s-${d}`, deliveryDate: d, theme: "", status: "no_theme", memo: "" };
    update((x) => ({ ...x, seminars: [...x.seminars, ep] }), `${formatDate(d)}の配信回を追加しました`);
  };

  return (
    <>
      <PageHead title="プチセミナー" sub="月曜日・金曜日の配信を想定" />
      <DemoBar>
        配信回はデモデータです。<OffBadge>公式LINE未連携（実際の予約配信は行いません）</OffBadge>
      </DemoBar>

      <SeminarRulesEditor />

      <div className="section-head">
        <h2>配信予定</h2>
        <div className="row">
          <label className="check">
            <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
            配信済みも表示
          </label>
          <button className="btn btn-sm" onClick={addNext}>
            ＋ 次の配信回を追加
          </button>
        </div>
      </div>

      <div className="stack section">
        {list.map((ep) => (
          <div key={ep.id} className="card seminar-card">
            <Link href={`/seminar/${ep.id}`} className="seminar-thumb" aria-label={`${formatDate(ep.deliveryDate)}配信の詳細・素材登録`}>
              <ThumbnailView media={ep.thumbnail} alt={`${ep.theme || formatDate(ep.deliveryDate)}のサムネイル`} small />
            </Link>
            <div style={{ minWidth: 0 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <div className="row">
                <strong>{formatDate(ep.deliveryDate)} 配信</strong>
                <span className={`status ${STATUS[ep.status].cls}`}>
                  <span aria-hidden="true">{STATUS[ep.status].icon}</span>
                  {STATUS[ep.status].label}
                </span>
                {ep.deliveryDate === today && <span className="badge badge-warning">今日配信</span>}
              </div>
              <span className="xs muted">{firstWorkLabel(data, ep)}</span>
            </div>
            <div className="grid-2" style={{ gap: 16 }}>
              <label className="field">
                テーマ
                <input type="text" value={ep.theme} onChange={(e) => patch(ep.id, { theme: e.target.value, status: ep.status === "no_theme" && e.target.value ? "making" : ep.status })} placeholder="未決定" />
              </label>
              <label className="field">
                状態
                <select value={ep.status} onChange={(e) => patch(ep.id, { status: e.target.value as SeminarStatus }, "状態を変更しました")}>
                  {(Object.keys(STATUS) as SeminarStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS[s].icon} {STATUS[s].label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field" style={{ marginTop: 8 }}>
              メモ
              <input type="text" value={ep.memo} onChange={(e) => patch(ep.id, { memo: e.target.value })} placeholder="台本のポイントなど" />
            </label>
            <div className="row" style={{ marginTop: 8, justifyContent: "space-between" }}>
              <span className="row xs" style={{ gap: 4 }}>
                <span className={`badge ${ep.thumbnail ? "badge-ok" : "badge-off"}`}>{ep.thumbnail ? "✓ サムネイル" : "サムネイル未登録"}</span>
                {ep.youtubeUrl ? (
                  <span className="badge badge-ok">✓ YouTube（限定公開）URL登録済み</span>
                ) : (
                  <span className={`badge ${ep.video?.stored ? "badge-ok" : ep.video ? "badge-warning" : "badge-off"}`}>
                    {ep.video?.stored ? "✓ 動画（ブラウザ内保存）" : ep.video ? "! 動画（ファイル名のみ）" : "動画未登録"}
                  </span>
                )}
                {ep.lineDraft && <span className="badge badge-danger">LINE下書きあり・予約未完了</span>}
              </span>
              <Link href={`/seminar/${ep.id}`} className="btn btn-sm btn-primary">
                詳細・素材登録 →
              </Link>
            </div>
            </div>
          </div>
        ))}
      </div>

      <section className="section card stack" aria-labelledby="h-idea">
        <div className="row">
          <h2 id="h-idea">自動化の構想メモ</h2>
          <span className="badge badge-off">今後検討</span>
        </div>
        <p className="small muted">動画アップロードから公式LINEの配信予約までの自動化構想。実装可能な連携方法は後の段階で確認します。</p>
        <textarea value={idea} onChange={(e) => setIdea(e.target.value)} style={{ minHeight: 180 }} />
        <div>
          <button className="btn btn-primary" disabled={idea === data.settings.seminarIdea} onClick={() => update((d) => ({ ...d, settings: { ...d.settings, seminarIdea: idea } }), "構想メモを保存しました")}>
            保存する
          </button>
        </div>
      </section>
    </>
  );
}
