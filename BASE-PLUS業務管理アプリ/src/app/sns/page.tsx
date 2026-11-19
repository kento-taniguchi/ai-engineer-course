"use client";

// 発信・SNS（リール動画の準備）
//  - テーマ選定・投稿文: AIで支援する構想（現在はデモ。接続先AIは未確定）
//  - 伝えたいこと・台本・撮影カット・撮影・編集: 谷口さん本人が行う（メモと進捗管理）

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ReelProject, SnsAudience, SnsTheme } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { newId } from "@/lib/selectors";
import { toISO } from "@/lib/time";
import { SNS_STEPS } from "@/lib/migrate";
import { AUDIENCE_LABEL, captionToText, demoContentAssist } from "@/services/contentAssist";
import { ShareBox } from "@/components/ShareBox";
import { ReelDraftSection } from "@/components/ReelDraftSection";
import { DemoBadge, DemoBar, Empty, OffBadge, PageHead, StatusChip } from "@/components/ui";
import { SNS_TASKS } from "@/lib/workTasks";
import { setReelPosted, setSnsSchedule } from "@/lib/operations";
import { formatDateTime } from "@/lib/time";
import type { SnsTaskKey } from "@/lib/types";

const assist = demoContentAssist; // 実際のAIサービスに接続するときはここを差し替える
const SELF_STEPS = [1, 2, 3, 4, 5]; // 伝えたいこと／台本／撮影カット／撮影／編集
const AUDIENCES: SnsAudience[] = ["player", "parent", "coach"];

function emptyReel(title: string, audience: SnsAudience = "player", theme = ""): ReelProject {
  return {
    id: newId("r"),
    title,
    audience,
    theme,
    steps: SNS_STEPS.map((_, i) => ({ done: i === 0 && !!theme, memo: "" })),
    createdAt: toISO(new Date()),
  };
}

export default function SnsPage() {
  return (
    <Suspense>
      <SnsInner />
    </Suspense>
  );
}

function SnsInner() {
  const { data, update } = useApp();
  const params = useSearchParams();
  const reelParam = params.get("reel");
  const [selected, setSelected] = useState<string | null>(reelParam ?? data.reels[0]?.id ?? null);
  // ToDoから開いたときは、その企画を選んで「作業の予定」へ移動
  useEffect(() => {
    if (!reelParam) return;
    setSelected(reelParam);
    const t = window.setTimeout(() => document.getElementById("sns-schedule")?.scrollIntoView({ block: "start" }), 50);
    return () => window.clearTimeout(t);
  }, [reelParam]);
  const [title, setTitle] = useState("");
  const reel = data.reels.find((r) => r.id === selected) ?? data.reels[0];

  const addReel = (r: ReelProject, msg: string) => {
    update((d) => ({ ...d, reels: [r, ...d.reels] }), msg);
    setSelected(r.id);
  };

  return (
    <>
      <PageHead title="発信・SNS" sub="リール動画の準備を段階的に進めます" />
      <DemoBar>
        テーマ提案・投稿文作成はデモです（AI未接続・接続先未確定）。<OffBadge>Instagramには未連携（自動投稿しません）</OffBadge>
      </DemoBar>

      <div className="grid-side">
        <section className="stack-2" aria-labelledby="h-reels">
          <h2 id="h-reels">リール企画</h2>
          <ul className="list">
            {data.reels.length === 0 && (
              <li style={{ padding: 16 }} className="small muted">
                企画はまだありません
              </li>
            )}
            {data.reels.map((r) => {
              const done = r.steps.filter((s) => s.done).length;
              const nextIdx = r.steps.findIndex((s) => !s.done);
              return (
                <li key={r.id}>
                  <button
                    className="list-link"
                    style={{ width: "100%", border: "none", background: r.id === reel?.id ? "var(--navy-soft)" : "none", font: "inherit", textAlign: "left", cursor: "pointer" }}
                    aria-pressed={r.id === reel?.id}
                    onClick={() => setSelected(r.id)}
                  >
                    <div className="list-main">
                      <strong>{r.title}</strong>
                      <div className="progress" style={{ marginTop: 4 }} aria-hidden="true">
                        <span style={{ width: `${(done / SNS_STEPS.length) * 100}%` }} />
                      </div>
                      <span className="xs muted">
                        {done}/{SNS_STEPS.length} 段階完了{nextIdx >= 0 ? `・次：${SNS_STEPS[nextIdx]}` : "・投稿済み"}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="card stack">
            <label className="field">
              新しい企画
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：冬のトレーニング3選" />
            </label>
            <div>
              <button
                className="btn btn-primary"
                disabled={!title.trim()}
                onClick={() => {
                  addReel(emptyReel(title.trim()), "企画を追加しました");
                  setTitle("");
                }}
              >
                ＋ 追加
              </button>
            </div>
          </div>
          <SavedThemes onUse={(t) => addReel(emptyReel(t.text, t.audience, t.text), "保存したテーマから企画を作りました")} />
        </section>

        <section aria-label="企画の詳細">
          {!reel ? <Empty>企画を選択してください</Empty> : <ReelEditor key={reel.id} reel={reel} onDeleted={() => setSelected(null)} onCreate={addReel} />}
        </section>
      </div>
    </>
  );
}

function ReelEditor({ reel, onDeleted, onCreate }: { reel: ReelProject; onDeleted: () => void; onCreate: (r: ReelProject, msg: string) => void }) {
  const { update } = useApp();
  const patch = (fn: (r: ReelProject) => ReelProject, msg?: string) => update((d) => ({ ...d, reels: d.reels.map((r) => (r.id === reel.id ? fn(r) : r)) }), msg);
  const setStep = (i: number, p: Partial<ReelProject["steps"][number]>) => patch((r) => ({ ...r, steps: r.steps.map((s, j) => (j === i ? { ...s, ...p } : s)) }));

  return (
    <div className="stack-2">
      <div className="section-head" style={{ marginBottom: 0 }}>
        <h2>{reel.title}</h2>
        <button
          className="btn btn-sm btn-danger"
          onClick={() => {
            if (confirm(`「${reel.title}」を削除しますか？`)) {
              update((d) => ({ ...d, reels: d.reels.filter((r) => r.id !== reel.id) }), "企画を削除しました");
              onDeleted();
            }
          }}
        >
          削除
        </button>
      </div>

      <SnsScheduleSection reel={reel} />

      <ThemeSection reel={reel} patch={patch} onCreate={onCreate} />

      <ReelDraftSection reel={reel} patch={patch} />

      <section className="card stack-2" aria-labelledby="h-self">
        <div className="row">
          <h3 id="h-self">2〜6. 進捗とメモ</h3>
          <span className="badge badge-kind">谷口さんが確認・実施</span>
        </div>
        <p className="xs muted">台本・撮影カットは上の下書き（AI支援・デモ）を確認・修正して使えます。撮影・編集は本人が行います（自動編集はしません）。完了したらチェックしてください。</p>
        <ol className="steps">
          {SELF_STEPS.map((i) => {
            const st = reel.steps[i];
            const label = SNS_STEPS[i];
            return (
              <li key={i} className={`step ${st.done ? "is-done" : ""}`}>
                <span className="step-num" aria-hidden="true">
                  {st.done ? "✓" : i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }} className="stack">
                  <label className="check" style={{ fontWeight: 700 }}>
                    <input type="checkbox" checked={st.done} onChange={(e) => patch((r) => ({ ...r, steps: r.steps.map((s, j) => (j === i ? { ...s, done: e.target.checked } : s)) }), e.target.checked ? `「${label}」を完了にしました` : `「${label}」を未完了に戻しました`)} />
                    {label}
                    <span className={`badge ${st.done ? "badge-ok" : "badge-off"}`}>{st.done ? "✓ 完了" : "未完了"}</span>
                  </label>
                  <label className="sr-only" htmlFor={`memo-${i}`}>
                    {label}のメモ
                  </label>
                  <textarea id={`memo-${i}`} value={st.memo} onChange={(e) => setStep(i, { memo: e.target.value })} placeholder="メモ（自動で保存されます）" style={{ minHeight: 64 }} />
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <CaptionSection key={`${reel.id}:${reel.caption ?? ""}`} reel={reel} patch={patch} />
    </div>
  );
}

function ThemeSection({
  reel,
  patch,
  onCreate,
}: {
  reel: ReelProject;
  patch: (fn: (r: ReelProject) => ReelProject, msg?: string) => void;
  onCreate: (r: ReelProject, msg: string) => void;
}) {
  const { data, update, notify } = useApp();
  const [audience, setAudience] = useState<SnsAudience>(reel.audience ?? "player");
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState(reel.theme ?? "");
  const saved = theme === (reel.theme ?? "");

  const saveTheme = (t: string, msg: string) => {
    setTheme(t);
    patch((r) => ({ ...r, theme: t, audience, steps: r.steps.map((s, i) => (i === 0 ? { ...s, done: !!t.trim() } : s)) }), msg);
  };
  const stock = (t: string) => {
    if (data.snsThemes.some((x) => x.text === t)) return notify("同じテーマは保存済みです", "info");
    const item: SnsTheme = { id: newId("th"), text: t, audience, source: "demo", createdAt: toISO(new Date()) };
    update((d) => ({ ...d, snsThemes: [item, ...d.snsThemes] }), "テーマ候補を保存しました");
  };

  return (
    <section className="card stack-2" aria-labelledby="h-theme">
      <div className="row">
        <h3 id="h-theme">1. テーマを決める</h3>
        <DemoBadge>AI支援・デモ</DemoBadge>
      </div>
      <div className="stack">
        <span className="small" style={{ fontWeight: 700 }}>
          発信の対象
        </span>
        <div className="chip-group" role="group" aria-label="発信の対象">
          {AUDIENCES.map((a) => (
            <button key={a} className="chip" aria-pressed={audience === a} onClick={() => setAudience(a)}>
              {AUDIENCE_LABEL[a]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <button
          className="btn"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            setCandidates(await assist.suggestThemes(audience));
            setLoading(false);
          }}
        >
          {loading ? "提案中…" : `${AUDIENCE_LABEL[audience]}向けのテーマ候補を表示（デモ）`}
        </button>
      </div>
      {candidates && (
        <div className="stack">
          <p className="xs muted">
            <DemoBadge>架空のサンプル</DemoBadge> AIによる提案ではありません。実際のAIサービスに接続すると、ここに提案が表示されます。
          </p>
          <ul className="list small">
            {candidates.map((c) => (
              <li key={c} className="row" style={{ padding: "8px 12px", justifyContent: "space-between" }}>
                <span style={{ flex: 1, minWidth: 160 }}>{c}</span>
                <span className="row" style={{ gap: 4 }}>
                  <button className="btn btn-sm btn-primary" onClick={() => saveTheme(c, "この企画のテーマにしました")}>
                    この企画のテーマにする
                  </button>
                  <button className="btn btn-sm" onClick={() => onCreate(emptyReel(c, audience, c), "新しい企画を作りました")}>
                    新しい企画にする
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => stock(c)}>
                    保存
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <label className="field">
        この企画のテーマ（編集できます）
        <input type="text" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="例：投球後に行いたい前腕のケア" />
      </label>
      <div className="row">
        <button className="btn btn-primary" disabled={saved} onClick={() => saveTheme(theme.trim(), "テーマを保存しました")}>
          テーマを保存
        </button>
        {reel.theme ? <span className="badge badge-ok">✓ 保存済み（{AUDIENCE_LABEL[reel.audience ?? "player"]}向け）</span> : <span className="badge badge-off">未決定</span>}
        {!saved && <span className="xs muted">未保存の変更があります</span>}
      </div>
    </section>
  );
}

function CaptionSection({ reel, patch }: { reel: ReelProject; patch: (fn: (r: ReelProject) => ReelProject, msg?: string) => void }) {
  const [content, setContent] = useState(reel.videoContent ?? "");
  const [caption, setCaption] = useState(reel.caption ?? "");
  const [loading, setLoading] = useState(false);
  const theme = reel.theme ?? "";
  const dirty = content !== (reel.videoContent ?? "") || caption !== (reel.caption ?? "");
  const audience = reel.audience ?? "player";

  return (
    <section className="card stack-2" aria-labelledby="h-caption">
      <div className="row">
        <h3 id="h-caption">7〜8. 投稿文の準備と投稿</h3>
        <DemoBadge>AI支援・デモ</DemoBadge>
      </div>
      <p className="small">
        テーマ：{theme ? <strong>{theme}</strong> : <span className="muted">未決定（上でテーマを保存してください）</span>}
      </p>
      <label className="field">
        動画の内容（谷口さんが入力）
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="例：投球後に前腕の筋肉をほぐすストレッチを3種類紹介。1つ20秒ずつ、左右行います。" />
      </label>
      <div className="row">
        <button
          className="btn"
          disabled={loading || !content.trim()}
          onClick={async () => {
            if (caption.trim() && !confirm("今の投稿文を、新しい下書きで置き換えますか？")) return;
            setLoading(true);
            const d = await assist.draftCaption({ theme, audience, videoContent: content });
            setCaption(captionToText(d));
            setLoading(false);
            patch((r) => ({ ...r, videoContent: content, caption: captionToText(d), captionFromDemo: true }), "投稿文の下書きを作成しました（デモ）");
          }}
        >
          {loading ? "作成中…" : "投稿文の下書きを作成（デモ）"}
        </button>
        {!content.trim() && <span className="xs muted">動画の内容を入力すると作成できます</span>}
      </div>
      <p className="xs muted">
        デモでは、冒頭の一文（テーマ）・動画の内容（入力した文章をそのまま使用）・視聴者への一言・ハッシュタグをテンプレートで組み合わせます。AIによる要約や文章生成は行っていません。
      </p>
      <label className="field">
        投稿文（編集できます）
        <textarea value={caption} onChange={(e) => setCaption(e.target.value)} style={{ minHeight: 200 }} placeholder="下書きを作成するか、直接入力してください" />
      </label>
      {reel.captionFromDemo && caption && (
        <p className="xs">
          <DemoBadge>デモで作成した文章を含みます</DemoBadge> 内容を確認・修正してから使ってください。
        </p>
      )}
      <div className="row">
        <button
          className="btn btn-primary"
          disabled={!dirty}
          onClick={() =>
            patch(
              (r) => ({ ...r, videoContent: content, caption, steps: r.steps.map((s, i) => (i === 6 ? { ...s, done: !!caption.trim() } : s)) }),
              "投稿文を保存しました",
            )
          }
        >
          保存する
        </button>
        {dirty && <span className="xs muted">未保存の変更があります</span>}
      </div>
      <ShareBox text={caption} subject={theme || "BASE-PLUS"} />
      <div className="notice notice-info small stack">
        <span>Instagramへの投稿は、Instagramアプリで手動で行ってください（アプリから自動投稿はしません）。</span>
        <PostedControl reel={reel} />
      </div>
    </section>
  );
}

function SavedThemes({ onUse }: { onUse: (t: SnsTheme) => void }) {
  const { data, update } = useApp();
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [manual, setManual] = useState("");
  return (
    <div className="card stack">
      <h3>保存したテーマ</h3>
      {data.snsThemes.length === 0 && <p className="xs muted">候補の「保存」や、下の入力欄から追加できます。</p>}
      <ul className="small" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {data.snsThemes.map((t) => (
          <li key={t.id} className="stack" style={{ gap: 4, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
            {editing === t.id ? (
              <>
                <input type="text" value={text} onChange={(e) => setText(e.target.value)} aria-label="テーマを編集" />
                <div className="row" style={{ gap: 4 }}>
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={!text.trim()}
                    onClick={() => {
                      update((d) => ({ ...d, snsThemes: d.snsThemes.map((x) => (x.id === t.id ? { ...x, text: text.trim() } : x)) }), "テーマを保存しました");
                      setEditing(null);
                    }}
                  >
                    保存
                  </button>
                  <button className="btn btn-sm" onClick={() => setEditing(null)}>
                    やめる
                  </button>
                </div>
              </>
            ) : (
              <>
                <span>
                  {t.text} <span className="xs muted">（{AUDIENCE_LABEL[t.audience]}向け{t.source === "demo" ? "・デモ候補" : ""}）</span>
                </span>
                <div className="row" style={{ gap: 4 }}>
                  <button className="btn btn-sm" onClick={() => onUse(t)}>
                    企画にする
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => {
                      setEditing(t.id);
                      setText(t.text);
                    }}
                  >
                    編集
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => update((d) => ({ ...d, snsThemes: d.snsThemes.filter((x) => x.id !== t.id) }), "削除しました")}>
                    削除
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input type="text" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="自分で考えたテーマを追加" aria-label="テーマを追加" />
        <button
          className="btn btn-sm"
          disabled={!manual.trim()}
          onClick={() => {
            update((d) => ({ ...d, snsThemes: [{ id: newId("th"), text: manual.trim(), audience: "player", source: "manual", createdAt: toISO(new Date()) }, ...d.snsThemes] }), "テーマを追加しました");
            setManual("");
          }}
        >
          追加
        </button>
      </div>
    </div>
  );
}

/** 本人が実際に投稿した後に押す「投稿済み」（ToDoの完了とは別） */
function PostedControl({ reel }: { reel: ReelProject }) {
  const { update } = useApp();
  const posted = !!reel.postedAt || !!reel.steps[7]?.done;
  return posted ? (
    <div className="row">
      <span className="badge badge-ok">✓ 投稿済み{reel.postedAt ? `（${formatDateTime(reel.postedAt)} に記録）` : ""}</span>
      <button className="btn btn-sm btn-ghost" onClick={() => update((d, n) => setReelPosted(d, reel.id, false, n), "未投稿に戻しました")}>
        未投稿に戻す
      </button>
    </div>
  ) : (
    <div className="row">
      <span className="badge badge-off">未投稿</span>
      <button className="btn btn-sm btn-gold" onClick={() => update((d, n) => setReelPosted(d, reel.id, true, n), "投稿済みにしました")}>
        投稿済みにする（自分で投稿した後に押す）
      </button>
    </div>
  );
}

/** 作業ごとの対応日・期限（設定した作業だけ「今日やること」に表示） */
function SnsScheduleSection({ reel }: { reel: ReelProject }) {
  const { data, update } = useApp();
  return (
    <section className="card stack-2" id="sns-schedule" aria-labelledby="h-sns-schedule" style={{ scrollMarginTop: 16 }}>
      <div className="row">
        <h3 id="h-sns-schedule">作業の予定（今日やることに表示）</h3>
      </div>
      <p className="xs muted">
        対応日か期限を入れた作業だけが「今日やること」の「発信・SNS」に表示されます。日付は自動では決めません。ToDoを完了にしても、Instagramに投稿したことにはなりません。
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>作業</th>
              <th>対応日</th>
              <th>期限</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {SNS_TASKS.map(({ key, label }) => {
              const sc = reel.taskSchedule?.[key] ?? {};
              const todo = data.todos.find((t) => t.id === `reel:${reel.id}:${key}`);
              const set = (p: { workDate?: string; dueDate?: string }) =>
                update((d, n) => setSnsSchedule(d, reel.id, key as SnsTaskKey, { workDate: sc.workDate, dueDate: sc.dueDate, ...p }, n), "作業の予定を保存しました");
              return (
                <tr key={key}>
                  <td>
                    {label}
                    {key === "post" && <div className="xs muted">投稿済みは下の「投稿済みにする」で記録</div>}
                  </td>
                  <td>
                    <input type="date" value={sc.workDate ?? ""} onChange={(e) => set({ workDate: e.target.value })} aria-label={`${label}の対応日`} style={{ minHeight: 32, padding: "2px 4px" }} />
                  </td>
                  <td>
                    <input type="date" value={sc.dueDate ?? ""} min={sc.workDate} onChange={(e) => set({ dueDate: e.target.value })} aria-label={`${label}の期限`} style={{ minHeight: 32, padding: "2px 4px" }} />
                  </td>
                  <td>{todo && (sc.workDate || sc.dueDate) ? <StatusChip status={todo.status} /> : <span className="xs muted">未設定</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
