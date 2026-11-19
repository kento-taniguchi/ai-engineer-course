"use client";

// プチセミナー詳細：サムネイル・動画の登録と、公式LINE配信予約の下書き

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { LineDraft, MediaRef, SeminarEpisode, SeminarStatus } from "@/lib/types";
import { useApp } from "@/store/AppStore";
import { newId } from "@/lib/selectors";
import { formatDate, formatDateTime, toISO } from "@/lib/time";
import { THUMB_MAX_SIDE, VIDEO_MAX_BYTES, deleteMedia, estimateStorage, formatBytes, resizeImage, saveMedia, type StorageEstimate } from "@/services/mediaStore";
import { copyText } from "@/services/share";
import { ThumbnailView, useMediaUrl } from "@/components/Media";
import { VideoFrameCapture, type CapturedFrame } from "@/components/VideoFrameCapture";
import { DemoBadge, Empty, OffBadge } from "@/components/ui";
import { SEMINAR_STATUS } from "@/lib/seminar";
import { parseYouTubeUrl, seminarLineText, youtubeThumb } from "@/lib/youtube";
import { EpisodeTasks } from "@/components/SeminarRules";

export default function SeminarDetailPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const { id } = useParams<{ id: string }>();
  const { data } = useApp();
  const ep = data.seminars.find((s) => s.id === id);
  if (!ep) {
    return (
      <>
        <Link href="/seminar" className="back-link">
          ← プチセミナー一覧
        </Link>
        <Empty>配信回が見つかりません</Empty>
      </>
    );
  }
  return <Detail key={ep.id} ep={ep} />;
}

function usePatch(id: string) {
  const { update } = useApp();
  return (p: Partial<SeminarEpisode> | ((e: SeminarEpisode) => Partial<SeminarEpisode>), msg?: string) =>
    update((d) => ({ ...d, seminars: d.seminars.map((s) => (s.id === id ? { ...s, ...(typeof p === "function" ? p(s) : p) } : s)) }), msg);
}

function Detail({ ep }: { ep: SeminarEpisode }) {
  const patch = usePatch(ep.id);
  const st = SEMINAR_STATUS[ep.status];
  return (
    <>
      <Link href="/seminar" className="back-link">
        <span aria-hidden="true">←</span> プチセミナー一覧
      </Link>
      <div className="page-head">
        <div>
          <h1>{formatDate(ep.deliveryDate)} 配信</h1>
          <p className="sub">
            {ep.theme || "テーマ未決定"}
          </p>
        </div>
        <span className={`status ${st.cls}`}>
          <span aria-hidden="true">{st.icon}</span>
          {st.label}
        </span>
      </div>

      <div className="steps-flow small section" aria-label="配信までの流れ">
        <FlowStep n={1} label="動画（YouTube限定公開のURL）" done={!!ep.youtubeUrl || !!ep.video} note={ep.youtubeUrl ? "URL登録済み" : ep.video ? "ブラウザ内に保存" : undefined} />
        <FlowStep n={2} label="サムネイル（動画から作成も可）" done={!!ep.thumbnail} />
        <FlowStep n={3} label="公式LINEの配信予約へ" done={false} partial={!!ep.lineDraft} note={ep.lineDraft ? "下書きあり・予約未完了" : "LINE未連携"} />
        <FlowStep n={4} label="配信内容・日時を設定" done={false} note="LINE未連携" />
      </div>

      <section className="card section stack-2" aria-labelledby="h-basic">
        <h2 id="h-basic">基本情報</h2>
        <div className="grid-2" style={{ gap: 16 }}>
          <label className="field">
            テーマ
            <input type="text" value={ep.theme} onChange={(e) => patch({ theme: e.target.value })} placeholder="未決定" />
          </label>
          <label className="field">
            状態
            <select value={ep.status} onChange={(e) => patch({ status: e.target.value as SeminarStatus }, "状態を変更しました")}>
              {(Object.keys(SEMINAR_STATUS) as SeminarStatus[]).map((s) => (
                <option key={s} value={s}>
                  {SEMINAR_STATUS[s].icon} {SEMINAR_STATUS[s].label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          メモ
          <input type="text" value={ep.memo} onChange={(e) => patch({ memo: e.target.value })} placeholder="台本のポイントなど" />
        </label>
      </section>

      <YouTubeSection ep={ep} />

      <div className="grid-2 section">
        <ThumbnailSection ep={ep} />
        <details className="card record">
          <summary className="small">
            <strong>動画をこのブラウザ内に保存する（任意）</strong>
            {ep.video && <span className="badge badge-kind" style={{ marginLeft: 6 }}>登録あり</span>}
          </summary>
          <div className="stack-2" style={{ marginTop: 12 }}>
            <p className="xs muted">サムネイルを動画の冒頭から作りたいときだけ使います。配信にはYouTubeのURLを使うので、ふだんは不要です。</p>
            <StorageNotice />
            <VideoSection ep={ep} />
          </div>
        </details>
      </div>

      <LineSection ep={ep} />

      <section className="card section stack" aria-labelledby="h-ep-tasks">
        <h2 id="h-ep-tasks">この回の準備作業（今日やることに表示）</h2>
        <EpisodeTasks ep={ep} />
      </section>
    </>
  );
}

function FlowStep({ n, label, done, partial = false, note }: { n: number; label: string; done: boolean; partial?: boolean; note?: string }) {
  return (
    <div className={`flow-step ${done ? "is-done" : ""}`}>
      <span className="step-num" aria-hidden="true">
        {done ? "✓" : partial ? "✎" : n}
      </span>
      <span>
        {label}
        <span className="sr-only">{done ? "（済み）" : partial ? "（下書きのみ）" : "（未完了）"}</span>
        {note && <span className="xs muted"> （{note}）</span>}
      </span>
    </div>
  );
}

function StorageNotice() {
  const [est, setEst] = useState<StorageEstimate | null>(null);
  useEffect(() => {
    estimateStorage().then(setEst);
  }, []);
  return (
    <div className="notice notice-warn small section stack" role="note">
      <strong>試作版での保存について</strong>
      <span>
        サムネイルと動画は<strong>このブラウザの中（IndexedDB）だけ</strong>に保存します。パソコンとiPhoneなど、別の端末・ブラウザでは見られません。ブラウザのサイトデータを削除したり、端末の空き容量が少なくなったりすると消えることがあります（特にiPhoneのSafari）。元のファイルは必ず端末やクラウドにも残してください。
      </span>
      <span>
        上限の目安：サムネイルは長辺{THUMB_MAX_SIDE}pxに縮小して保存／動画は1本{formatBytes(VIDEO_MAX_BYTES)}まで。
        {est && ` このブラウザの保存領域：使用 約${formatBytes(est.usage)}／空き 約${formatBytes(est.available)}`}
      </span>
    </div>
  );
}

// ---------- サムネイル ----------

function ThumbnailSection({ ep }: { ep: SeminarEpisode }) {
  const { notify } = useApp();
  const patch = usePatch(ep.id);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const applyFrame = async (f: CapturedFrame) => {
    setBusy(true);
    setError(null);
    const id = newId("thumb");
    const res = await saveMedia(id, f.blob);
    setBusy(false);
    if (!res.ok) {
      setError(res.reason);
      notify(`サムネイルを保存できませんでした：${res.reason}`, "error");
      return;
    }
    if (ep.thumbnail?.stored) await deleteMedia(ep.thumbnail.id);
    const now = toISO(new Date());
    const ref: MediaRef = {
      id,
      fileName: `${ep.video?.fileName ?? "動画"}（${f.sec.toFixed(1)}秒の画像）`,
      mime: "image/jpeg",
      bytes: f.blob.size,
      storedBytes: res.storedBytes,
      stored: true,
      verifiedAt: now,
      width: f.width,
      height: f.height,
      savedAt: now,
      source: "video-frame",
      frameSec: f.sec,
    };
    patch({ thumbnail: ref }, "動画から作った画像をサムネイルに設定しました（このブラウザ内に保存）");
  };

  const register = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { blob, width, height } = await resizeImage(file);
      const id = newId("thumb");
      const res = await saveMedia(id, blob);
      if (!res.ok) {
        setError(res.reason);
        notify(`サムネイルを保存できませんでした：${res.reason}`, "error");
        return;
      }
      if (ep.thumbnail?.stored) await deleteMedia(ep.thumbnail.id);
      const ref: MediaRef = { id, fileName: file.name, mime: "image/jpeg", bytes: file.size, storedBytes: res.storedBytes, stored: true, verifiedAt: toISO(new Date()), width, height, savedAt: toISO(new Date()), source: "upload" };
      patch({ thumbnail: ref }, ep.thumbnail ? "サムネイルを変更しました（このブラウザ内に保存）" : "サムネイルを登録しました（このブラウザ内に保存）");
      setFile(null);
      setInputKey((k) => k + 1);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "登録に失敗しました";
      setError(msg);
      notify(msg, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack-2" aria-labelledby="h-thumb">
      <h2 id="h-thumb">サムネイル</h2>
      <div style={{ maxWidth: 360 }}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="選択中の画像のプレビュー" style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 6, border: "2px dashed var(--gold)" }} />
        ) : (
          <ThumbnailView media={ep.thumbnail} alt={`${ep.theme || formatDate(ep.deliveryDate)}のサムネイル`} />
        )}
      </div>
      {preview && <p className="xs">
        <span className="badge badge-warning">! プレビュー中（まだ登録していません）</span>
      </p>}
      {ep.thumbnail && !preview && (
        <p className="xs muted">
          <span className="badge badge-ok">✓ 保存済み（読み戻し確認済み）</span>{" "}
          {ep.thumbnail.source === "video-frame" ? <span className="badge badge-kind">動画の{ep.thumbnail.frameSec?.toFixed(1)}秒から作成</span> : null} {ep.thumbnail.fileName} ・ {ep.thumbnail.width}×{ep.thumbnail.height}px／{formatBytes(ep.thumbnail.storedBytes ?? 0)} ・ {formatDateTime(ep.thumbnail.savedAt)}
        </p>
      )}
      <details className="record" open={!!ep.video?.stored && !ep.thumbnail}>
        <summary>
          <strong>動画の冒頭から作成</strong>
        </summary>
        <div className="record-body">
          <VideoFrameCapture video={ep.video} onUse={applyFrame} busy={busy} />
        </div>
      </details>
      <p className="small" style={{ fontWeight: 700, color: "var(--navy)", marginTop: 8 }}>または、画像を選んで設定</p>
      <label className="field">
        画像を選択
        <input key={inputKey} type="file" accept="image/*" onChange={(e) => { setError(null); setFile(e.target.files?.[0] ?? null); }} />
      </label>
      {file && <p className="xs muted">選択中：{file.name}（{formatBytes(file.size)}）</p>}
      {error && <div className="notice notice-danger small" role="alert">⚠ 保存できませんでした：{error}</div>}
      <div className="row">
        <button className="btn btn-primary" disabled={!file || busy} onClick={register}>
          {busy ? "保存中…" : ep.thumbnail ? "このサムネイルに変更" : "このサムネイルで登録"}
        </button>
        {file && (
          <button className="btn" onClick={() => { setFile(null); setInputKey((k) => k + 1); }}>
            選択をやめる
          </button>
        )}
        {ep.thumbnail && !file && (
          <button
            className="btn btn-danger"
            onClick={async () => {
              if (!confirm("サムネイルを削除しますか？")) return;
              await deleteMedia(ep.thumbnail!.id);
              patch({ thumbnail: undefined }, "サムネイルを削除しました");
            }}
          >
            削除
          </button>
        )}
      </div>
    </section>
  );
}

// ---------- 動画 ----------

function VideoSection({ ep }: { ep: SeminarEpisode }) {
  const { notify } = useApp();
  const patch = usePatch(ep.id);
  const saved = useMediaUrl(ep.video);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const tooBig = !!file && file.size > VIDEO_MAX_BYTES;

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const reset = () => {
    setFile(null);
    setInputKey((k) => k + 1);
  };

  const register = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const id = newId("video");
    const res = await saveMedia(id, file);
    setBusy(false);
    if (!res.ok) {
      setError(res.reason);
      notify(`動画を保存できませんでした：${res.reason}`, "error");
      return;
    }
    if (ep.video?.stored) await deleteMedia(ep.video.id);
    const ref: MediaRef = { id, fileName: file.name, mime: file.type, bytes: file.size, storedBytes: res.storedBytes, stored: true, verifiedAt: toISO(new Date()), savedAt: toISO(new Date()) };
    patch({ video: ref }, ep.video ? "動画を変更しました（このブラウザ内に保存・確認済み）" : "動画を登録しました（このブラウザ内に保存・確認済み）");
    reset();
  };

  const recordNameOnly = async () => {
    if (!file) return;
    if (ep.video?.stored) await deleteMedia(ep.video.id);
    const ref: MediaRef = { id: newId("video"), fileName: file.name, mime: file.type, bytes: file.size, stored: false, savedAt: toISO(new Date()) };
    patch({ video: ref }, "ファイル名だけ記録しました（動画本体は保存していません）");
    setError(null);
    reset();
  };

  return (
    <section className="card stack-2" aria-labelledby="h-video">
      <h2 id="h-video">動画</h2>

      {ep.video && !file && (
        <div className="stack">
          {ep.video.stored ? (
            saved.status === "missing" ? (
              <div className="notice notice-danger small" role="alert">
                ⚠ 登録済みの動画がこのブラウザ内に見つかりません（別の端末・ブラウザで開いているか、データが削除された可能性があります）。もう一度登録してください。
              </div>
            ) : (
              <>
                {saved.status === "ready" && <video src={saved.url} controls playsInline style={{ width: "100%", maxHeight: 320, borderRadius: 6, background: "#000" }} />}
                <p className="xs">
                  <span className="badge badge-ok">✓ このブラウザ内に保存済み（読み戻し確認済み）</span>
                </p>
              </>
            )
          ) : (
            <div className="notice notice-warn small">
              <strong>⚠ ファイル名のみ記録（動画本体は保存されていません）</strong>
            </div>
          )}
          <p className="xs muted">
            {ep.video.fileName}（{formatBytes(ep.video.bytes)}）・ 登録 {formatDateTime(ep.video.savedAt)}
          </p>
        </div>
      )}
      {!ep.video && !file && <div className="empty">動画は未登録です</div>}

      {file && (
        <div className="stack">
          {preview && !tooBig && <video src={preview} controls playsInline style={{ width: "100%", maxHeight: 320, borderRadius: 6, background: "#000" }} />}
          <p className="small">
            <span className="badge badge-warning">! 選択中（まだ登録していません）</span>
            <br />
            ファイル名：<strong>{file.name}</strong>
            <br />
            サイズ：{formatBytes(file.size)} ／ 形式：{file.type || "不明"}
          </p>
          {tooBig && (
            <div className="notice notice-danger small" role="alert">
              ⚠ 試作版でブラウザ内に保存できる上限（{formatBytes(VIDEO_MAX_BYTES)}）を超えています。動画本体は保存できません。ファイル名だけ記録することはできます。
            </div>
          )}
        </div>
      )}

      <label className="field">
        {ep.video ? "動画を変更する" : "動画を選択"}
        <input key={inputKey} type="file" accept="video/*" onChange={(e) => { setError(null); setFile(e.target.files?.[0] ?? null); }} />
      </label>
      {error && (
        <div className="notice notice-danger small stack" role="alert">
          <span>⚠ 動画は保存されていません：{error}</span>
          <div>
            <button className="btn btn-sm" onClick={recordNameOnly}>
              ファイル名だけ記録する
            </button>
          </div>
        </div>
      )}
      <div className="row">
        {file && !tooBig && (
          <button className="btn btn-primary" disabled={busy} onClick={register}>
            {busy ? "保存して確認中…" : ep.video ? "この動画に変更（ブラウザ内に保存）" : "動画を登録（ブラウザ内に保存）"}
          </button>
        )}
        {file && tooBig && (
          <button className="btn" onClick={recordNameOnly}>
            ファイル名だけ記録する
          </button>
        )}
        {file && (
          <button className="btn" onClick={reset} disabled={busy}>
            選択をやめる
          </button>
        )}
        {ep.video && !file && (
          <button
            className="btn btn-danger"
            onClick={async () => {
              if (!confirm("登録した動画を削除しますか？")) return;
              if (ep.video?.stored) await deleteMedia(ep.video.id);
              patch({ video: undefined }, "動画の登録を削除しました");
            }}
          >
            削除
          </button>
        )}
      </div>
      {ep.video && (ep.status === "no_theme" || ep.status === "making") && (
        <div>
          <button className="btn btn-sm" onClick={() => patch({ status: "ready" }, "状態を「動画準備完了」にしました")}>
            状態を「動画準備完了」にする
          </button>
        </div>
      )}
    </section>
  );
}

// ---------- YouTube（限定公開） ----------

function YouTubeSection({ ep }: { ep: SeminarEpisode }) {
  const { notify } = useApp();
  const patch = usePatch(ep.id);
  const [text, setText] = useState("");
  const parsed = text.trim() ? parseYouTubeUrl(text) : null;

  // 正しいURLを貼り付けたら、そのまま保存する（保存ボタンを押す手間を省く）
  const accept = (value: string) => {
    setText(value);
    const p = parseYouTubeUrl(value);
    if (p.ok && p.url !== ep.youtubeUrl) {
      patch({ youtubeUrl: p.url, youtubeVideoId: p.videoId, youtubeSavedAt: toISO(new Date()) }, "YouTubeのURLを登録しました");
      setText("");
    }
  };

  return (
    <section className="card section stack-2" aria-labelledby="h-yt">
      <div className="row">
        <h2 id="h-yt">1. 動画（YouTubeに限定公開）</h2>
        {ep.youtubeUrl ? <span className="badge badge-ok">✓ URL登録済み</span> : <span className="badge badge-off">未登録</span>}
      </div>

      {ep.youtubeUrl && ep.youtubeVideoId ? (
        <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
          <a href={ep.youtubeUrl} target="_blank" rel="noopener noreferrer" aria-label="YouTubeで動画を開く">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={youtubeThumb(ep.youtubeVideoId)} alt="YouTube動画のサムネイル" width={192} height={108} style={{ objectFit: "cover", borderRadius: 6, background: "#000" }} />
          </a>
          <div className="stack" style={{ flex: 1, minWidth: 200 }}>
            <a href={ep.youtubeUrl} target="_blank" rel="noopener noreferrer" className="small" style={{ wordBreak: "break-all" }}>
              {ep.youtubeUrl}
            </a>
            <span className="xs muted">登録 {ep.youtubeSavedAt ? formatDateTime(ep.youtubeSavedAt) : ""}</span>
            <div className="row">
              <button
                className="btn btn-sm btn-primary"
                onClick={async () => notify((await copyText(ep.lineDraft?.text?.includes(ep.youtubeUrl!) ? ep.lineDraft.text : seminarLineText(ep.theme, ep.youtubeUrl))) ? "公式LINEの配信文をコピーしました（LINE公式アカウントのアプリに貼り付けてください）" : "コピーできませんでした", "info")}
              >
                公式LINEの配信文をコピー
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => confirm("登録したYouTubeのURLを外しますか？（YouTubeの動画は削除されません）") && patch({ youtubeUrl: undefined, youtubeVideoId: undefined, youtubeSavedAt: undefined }, "URLを外しました")}>
                URLを外す
              </button>
            </div>
            <p className="xs muted">限定公開（リンクを知っている人だけが見られる）になっているかは、YouTubeの「公開設定」で確認してください。このアプリからは確認できません。</p>
          </div>
        </div>
      ) : (
        <ol className="small" style={{ margin: "0 0 0 20px" }}>
          <li>iPhoneのYouTubeアプリで「＋」→ 動画を選ぶ → 公開設定を <strong>限定公開</strong> にしてアップロード</li>
          <li>アップロードした動画の「共有」→「コピー」</li>
          <li>下の欄に貼り付け（貼り付けると自動で登録されます）</li>
        </ol>
      )}

      <label className="field">
        {ep.youtubeUrl ? "別の動画のURLに変える" : "YouTubeの動画のURL"}
        <input type="url" inputMode="url" value={text} onChange={(e) => accept(e.target.value)} placeholder="https://youtu.be/…" autoComplete="off" spellCheck={false} />
      </label>
      {parsed && !parsed.ok && (
        <p className="small" role="alert" style={{ color: "var(--danger)" }}>
          ⚠ {parsed.error}
        </p>
      )}
    </section>
  );
}

// ---------- 公式LINE ----------

function defaultLineText(ep: SeminarEpisode): string {
  return seminarLineText(ep.theme, ep.youtubeUrl);
}

function LineSection({ ep }: { ep: SeminarEpisode }) {
  const { notify } = useApp();
  const patch = usePatch(ep.id);
  const [opened, setOpened] = useState(!!ep.lineDraft);
  const init: LineDraft = ep.lineDraft ?? { text: defaultLineText(ep), date: ep.deliveryDate, time: "19:00", attachThumbnail: !!ep.thumbnail, attachVideo: !!ep.video, savedAt: "" };
  const [draft, setDraft] = useState<LineDraft>(init);
  const dirty = !ep.lineDraft || JSON.stringify({ ...draft, savedAt: "" }) !== JSON.stringify({ ...ep.lineDraft, savedAt: "" });

  return (
    <section className="card section stack-2" aria-labelledby="h-line">
      <div className="row">
        <h2 id="h-line">3〜4. 公式LINEの配信予約</h2>
        <span className="badge badge-danger">⊘ LINE未連携・予約未完了</span>
      </div>
      {!ep.video && !ep.youtubeUrl ? (
        <>
          <p className="small muted">YouTubeのURLを登録すると、配信予約の設定に進めます。</p>
          <div>
            <button className="btn" disabled>
              公式LINEの配信予約へ進む
            </button>
          </div>
        </>
      ) : !opened ? (
        <div>
          <button className="btn btn-gold" onClick={() => setOpened(true)}>
            公式LINEの配信予約へ進む →
          </button>
        </div>
      ) : (
        <div className="stack-2">
          <div className="notice notice-danger small" role="note">
            <strong>このアプリから公式LINEへの送信・予約は行いません。</strong>
            ここで入力した内容は「下書き」としてこのブラウザ内に保存されるだけで、<strong>配信予約は完了していません</strong>。実際の予約は、公式LINEの管理画面で設定してください。
          </div>
          <label className="field">
            配信内容
            <textarea value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} style={{ minHeight: 140 }} />
          </label>
          {ep.youtubeUrl && !draft.text.includes(ep.youtubeUrl) && (
            <div className="notice notice-warn small" role="status">
              ! 配信内容に、登録したYouTubeのURLが入っていません。
              <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => setDraft({ ...draft, text: defaultLineText(ep) })}>
                URL入りの文面に置き換える
              </button>
            </div>
          )}
          <div className="grid-2" style={{ gap: 16 }}>
            <label className="field">
              配信予定日
              <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            </label>
            <label className="field">
              配信予定時刻
              <input type="time" step={300} value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
            </label>
          </div>
          <fieldset style={{ border: "none", padding: 0, margin: 0 }} className="stack">
            <legend className="small" style={{ fontWeight: 700, color: "var(--navy)" }}>
              添付する予定のもの（メモ）
            </legend>
            <label className="check">
              <input type="checkbox" checked={draft.attachThumbnail} disabled={!ep.thumbnail} onChange={(e) => setDraft({ ...draft, attachThumbnail: e.target.checked })} />
              サムネイル {ep.thumbnail ? "" : "（未登録）"}
            </label>
            {ep.youtubeUrl ? (
              <p className="small">動画：YouTube（限定公開）のURLを本文に記載</p>
            ) : (
              ep.video && (
                <label className="check">
                  <input type="checkbox" checked={draft.attachVideo} onChange={(e) => setDraft({ ...draft, attachVideo: e.target.checked })} />
                  動画（{ep.video.fileName}）
                </label>
              )
            )}
            <p className="xs muted">動画を公式LINEでどう配信するか（動画メッセージ・リンク等）や容量の条件は、公式情報と実際のアカウント設定を確認してから決めます。</p>
          </fieldset>
          <div className="row">
            <button
              className="btn btn-primary"
              disabled={!dirty || !draft.text.trim()}
              onClick={() => patch({ lineDraft: { ...draft, savedAt: toISO(new Date()) } }, "配信内容の下書きを保存しました（予約は未完了）")}
            >
              下書きを保存
            </button>
            <button
              className="btn"
              disabled={!draft.text.trim()}
              onClick={async () => notify((await copyText(draft.text)) ? "配信内容をコピーしました" : "コピーできませんでした", "info")}
            >
              配信内容をコピー
            </button>
            <a className="btn btn-ghost" href="https://manager.line.biz/" target="_blank" rel="noopener noreferrer">
              LINE公式アカウントの管理画面を開く
            </a>
            {ep.lineDraft && <span className="xs muted">下書き保存 {formatDateTime(ep.lineDraft.savedAt)}</span>}
          </div>
          {ep.lineDraft && ep.status !== "waiting_reserve" && ep.status !== "delivered" && (
            <div>
              <button className="btn btn-sm" onClick={() => patch({ status: "waiting_reserve" }, "状態を「配信予約待ち」にしました")}>
                状態を「配信予約待ち」にする
              </button>
            </div>
          )}
          <p className="xs">
            <DemoBadge>試作版</DemoBadge> 予約状況：<OffBadge>LINE未連携・予約未完了</OffBadge>
          </p>
        </div>
      )}
    </section>
  );
}
