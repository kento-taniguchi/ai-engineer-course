"use client";

// 参考リールから台本・撮影カット・投稿文の下書きを作る（AI支援・デモ）

import { useState } from "react";
import type { ReelProject, ShotCut } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { newId } from "@/lib/selectors";
import { AUDIENCE_LABEL, demoReelPlanner, shotsToText, validateInstagramUrl } from "@/services/contentAssist";
import { copyText } from "@/services/share";
import { DemoBadge, OffBadge } from "./ui";

const planner = demoReelPlanner; // 実際のAIに接続するときはここを差し替える
const LENGTHS = [15, 30, 45, 60, 90];

type Patch = (fn: (r: ReelProject) => ReelProject, msg?: string) => void;

function CopyButton({ text, label = "コピー" }: { text: string; label?: string }) {
  const { notify } = useApp();
  return (
    <button
      className="btn btn-sm"
      disabled={!text.trim()}
      onClick={async () => {
        const ok = await copyText(text);
        notify(ok ? "コピーしました" : "コピーできませんでした", ok ? "ok" : "error");
      }}
    >
      {label}
    </button>
  );
}

export function ReelDraftSection({ reel, patch }: { reel: ReelProject; patch: Patch }) {
  const { data, update, notify } = useApp();
  const [url, setUrl] = useState(reel.referenceUrl ?? "");
  const [refNotes, setRefNotes] = useState(reel.referenceNotes ?? "");
  const [message, setMessage] = useState(reel.message ?? reel.steps[1]?.memo ?? "");
  const [lengthSec, setLengthSec] = useState(reel.lengthSec ?? 30);
  const [extra, setExtra] = useState(reel.extraNotes ?? "");
  const [style, setStyle] = useState(data.settings.snsStyleNote ?? "");
  const [loading, setLoading] = useState(false);
  const [notices, setNotices] = useState<string[]>([]);

  const urlCheck = url.trim() ? validateInstagramUrl(url) : null;
  const theme = reel.theme ?? "";
  const audience = reel.audience ?? "player";
  const inputsDirty =
    url !== (reel.referenceUrl ?? "") || refNotes !== (reel.referenceNotes ?? "") || message !== (reel.message ?? reel.steps[1]?.memo ?? "") || lengthSec !== (reel.lengthSec ?? 30) || extra !== (reel.extraNotes ?? "");
  const canDraft = !!theme.trim() && !!message.trim() && (!url.trim() || urlCheck?.ok);

  const saveInputs = (msg?: string) =>
    patch((r) => ({ ...r, referenceUrl: url.trim() || undefined, referenceNotes: refNotes, message, lengthSec, extraNotes: extra, steps: r.steps.map((s, i) => (i === 1 && !s.memo ? { ...s, memo: message } : s)) }), msg);

  const draft = async () => {
    if ((reel.hook || reel.script || reel.shots?.length) && !confirm("今のフック・台本・撮影カットを、新しい下書きで置き換えますか？")) return;
    setLoading(true);
    if (style !== (data.settings.snsStyleNote ?? "")) update((d) => ({ ...d, settings: { ...d.settings, snsStyleNote: style } }));
    const d = await planner.draftReelPlan({ theme, audience, message, lengthSec, extraNotes: extra, styleNote: style, referenceNotes: refNotes });
    setLoading(false);
    setNotices(d.notices);
    const replaceCaption = !reel.caption?.trim() || confirm("投稿文も新しい下書きで置き換えますか？（キャンセルすると今の投稿文を残します）");
    patch(
      (r) => ({
        ...r,
        referenceUrl: url.trim() || undefined,
        referenceNotes: refNotes,
        message,
        lengthSec,
        extraNotes: extra,
        hook: d.hook,
        script: d.script,
        shots: d.shots.map((s) => ({ id: newId("cut"), ...s })),
        draftFromDemo: true,
        contentChecked: false,
        ...(replaceCaption ? { caption: d.caption, captionFromDemo: true } : {}),
      }),
      "下書きを作成しました（デモ）。内容を確認・修正してください",
    );
    notify("医学・トレーニングの内容は確認されていません。ご自身で確認してください", "info");
  };

  return (
    <section className="card stack-2" aria-labelledby="h-ref">
      <div className="row">
        <h3 id="h-ref">参考リールから台本・撮影カットを作る</h3>
        <DemoBadge>AI支援・デモ</DemoBadge>
        <OffBadge>動画解析なし</OffBadge>
      </div>
      <p className="xs muted">下書きは必ずご自身で確認・修正してください。参考動画の文章や表現はそのまま使わず、テーマと伝えたい内容から独自の下書きを作ります。</p>

      {/* 参考リール */}
      <div className="stack">
        <label className="field">
          参考にしたいInstagramリールのURL（任意）
          <input type="text" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.instagram.com/reel/XXXX/" aria-invalid={urlCheck ? !urlCheck.ok : undefined} />
        </label>
        {urlCheck && !urlCheck.ok && (
          <p className="small" style={{ color: "var(--danger)" }} role="alert">
            ⚠ {urlCheck.reason}
          </p>
        )}
        {urlCheck?.ok && (
          <div className="notice notice-warn small stack" role="note">
            <span>
              <span className="badge badge-ok">✓ URLの形は正しいです</span>{" "}
              <a href={url.trim()} target="_blank" rel="noopener noreferrer">
                Instagramで開く ↗
              </a>
            </span>
            <span>
              <strong>参考動画の中身は読み取っていません（未分析）。</strong>
              理由：InstagramはURLから他のアカウントの動画の中身を外部アプリに渡す公式の方法を提供しておらず、埋め込み用の仕組み（oEmbed）も表示専用です。ページの自動取得はログインや利用規約の制限があります。
            </span>
            <span>動画を見て、内容・文字起こし・構成のメモを下の欄に入力してください。</span>
          </div>
        )}
        <label className="field">
          参考動画の内容・文字起こし・構成のメモ（本人が入力）
          <textarea value={refNotes} onChange={(e) => setRefNotes(e.target.value)} placeholder="例：冒頭で質問 → 悪い例 → 良い例 → ポイント3つ → 保存を促す。テンポが速く、テロップ多め。" style={{ minHeight: 80 }} />
        </label>
      </div>

      {/* 下書きの材料 */}
      <div className="stack">
        <p className="small">
          テーマ：{theme ? <strong>{theme}</strong> : <span style={{ color: "var(--danger)" }}>未決定（上の「1. テーマを決める」で保存してください）</span>} ／ 対象：{AUDIENCE_LABEL[audience]}
        </p>
        <label className="field">
          伝えたい内容（必須・1文ずつ区切るとポイントに分かれます）
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="例：投球後は前腕をほぐす。手首を反らすストレッチを20秒。反対側も行う。" style={{ minHeight: 80 }} />
        </label>
        <div className="grid-2" style={{ gap: 16 }}>
          <label className="field">
            動画の長さの目安
            <select value={lengthSec} onChange={(e) => setLengthSec(Number(e.target.value))}>
              {LENGTHS.map((l) => (
                <option key={l} value={l}>
                  約{l}秒
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            補足メモ
            <input type="text" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="例：最後に体験の案内を入れたい" />
          </label>
        </div>
        <label className="field">
          谷口さんの話し方・決まり文句（全企画共通・任意）
          <input type="text" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="例：語尾は「〜しましょう」。最初に「こんにちは、BASE-PLUSの谷口です」" />
        </label>
        <div className="row">
          <button className="btn" disabled={!inputsDirty} onClick={() => saveInputs("入力内容を保存しました")}>
            入力内容を保存
          </button>
          <button className="btn btn-primary" disabled={!canDraft || loading} onClick={draft}>
            {loading ? "作成中…" : "台本・撮影カット・投稿文の下書きを作成（デモ）"}
          </button>
        </div>
        {!canDraft && <p className="xs muted">テーマと伝えたい内容を入れると作成できます（URLは正しい形の場合のみ）。</p>}
      </div>

      {notices.length > 0 && (
        <ul className="notice notice-info small" style={{ margin: 0, paddingLeft: 32 }}>
          {notices.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      {(reel.hook || reel.script || (reel.shots && reel.shots.length > 0)) && <DraftOutputs key={`${reel.id}-${reel.hook}-${reel.shots?.length}`} reel={reel} patch={patch} />}
    </section>
  );
}

function DraftOutputs({ reel, patch }: { reel: ReelProject; patch: Patch }) {
  const [hook, setHook] = useState(reel.hook ?? "");
  const [script, setScript] = useState(reel.script ?? "");
  const [shots, setShots] = useState<ShotCut[]>(reel.shots ?? []);
  const shotsDirty = JSON.stringify(shots) !== JSON.stringify(reel.shots ?? []);
  const setShot = (i: number, p: Partial<ShotCut>) => setShots((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: number) =>
    setShots((s) => {
      const n = [...s];
      const [x] = n.splice(i, 1);
      n.splice(Math.max(0, Math.min(n.length, i + d)), 0, x);
      return n;
    });

  return (
    <div className="stack-2">
      <div className={`notice ${reel.contentChecked ? "notice-info" : "notice-warn"} small stack`}>
        {reel.draftFromDemo && (
          <span>
            <DemoBadge>デモで作成した下書きを含みます</DemoBadge> AIによる生成・動画の分析は行っていません。
          </span>
        )}
        <label className="check">
          <input type="checkbox" checked={!!reel.contentChecked} onChange={(e) => patch((r) => ({ ...r, contentChecked: e.target.checked }), e.target.checked ? "内容を確認済みにしました" : "未確認に戻しました")} />
          医学・トレーニングに関する内容を自分で確認した
        </label>
        {!reel.contentChecked && <span className="badge badge-warning">! 内容は未確認です（自動で事実確認はしていません）</span>}
      </div>

      <div className="stack">
        <label className="field">
          動画冒頭のフック
          <input type="text" value={hook} onChange={(e) => setHook(e.target.value)} />
        </label>
        <div className="row">
          <button className="btn btn-sm btn-primary" aria-label="フックを保存" disabled={hook === (reel.hook ?? "")} onClick={() => patch((r) => ({ ...r, hook }), "フックを保存しました")}>
            保存
          </button>
          <CopyButton text={hook} label="フックをコピー" />
        </div>
      </div>

      <div className="stack">
        <label className="field">
          台本（谷口さん仕様の下書き・編集できます）
          <textarea value={script} onChange={(e) => setScript(e.target.value)} style={{ minHeight: 240 }} />
        </label>
        <div className="row">
          <button
            className="btn btn-sm btn-primary"
            aria-label="台本を保存"
            disabled={script === (reel.script ?? "")}
            onClick={() => patch((r) => ({ ...r, script, steps: r.steps.map((s, i) => (i === 2 ? { ...s, done: s.done || !!script.trim() } : s)) }), "台本を保存しました")}
          >
            保存
          </button>
          <CopyButton text={script} label="台本をコピー" />
        </div>
      </div>

      <div className="stack">
        <h4 style={{ margin: 0, color: "var(--navy)" }}>撮影カット案（上から撮影・編集の順番）</h4>
        <ol className="steps">
          {shots.map((s, i) => (
            <li key={s.id} className="step" style={{ alignItems: "stretch" }}>
              <span className="step-num" aria-hidden="true">
                {i + 1}
              </span>
              <div className="stack" style={{ flex: 1, minWidth: 0 }}>
                <label className="field">
                  何を映すか
                  <input type="text" value={s.visual} onChange={(e) => setShot(i, { visual: e.target.value })} />
                </label>
                <label className="field">
                  話す内容・表示する言葉
                  <textarea value={s.words} onChange={(e) => setShot(i, { words: e.target.value })} style={{ minHeight: 56 }} />
                </label>
                <div className="row" style={{ gap: 4 }}>
                  <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    約
                    <input type="number" min={1} value={s.seconds ?? ""} onChange={(e) => setShot(i, { seconds: Number(e.target.value) || undefined })} style={{ width: 72, minHeight: 32 }} aria-label={`カット${i + 1}の秒数`} />秒
                  </label>
                  <button className="btn btn-sm btn-ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`カット${i + 1}を上へ`}>
                    ↑
                  </button>
                  <button className="btn btn-sm btn-ghost" disabled={i === shots.length - 1} onClick={() => move(i, 1)} aria-label={`カット${i + 1}を下へ`}>
                    ↓
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setShots((x) => x.filter((_, j) => j !== i))}>
                    削除
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <div className="row">
          <button className="btn btn-sm" onClick={() => setShots((x) => [...x, { id: newId("cut"), visual: "", words: "" }])}>
            ＋ カットを追加
          </button>
          <button
            className="btn btn-sm btn-primary"
            aria-label="撮影カットを保存"
            disabled={!shotsDirty}
            onClick={() => patch((r) => ({ ...r, shots, steps: r.steps.map((st, i) => (i === 3 ? { ...st, done: st.done || shots.length > 0 } : st)) }), "撮影カットを保存しました")}
          >
            保存
          </button>
          <CopyButton text={shotsToText(shots)} label="撮影カットをコピー" />
          {shotsDirty && <span className="xs muted">未保存の変更があります</span>}
        </div>
      </div>
      <p className="xs muted">Instagram投稿文は、下の「投稿文の準備と投稿」で編集・コピーできます。</p>
    </div>
  );
}
