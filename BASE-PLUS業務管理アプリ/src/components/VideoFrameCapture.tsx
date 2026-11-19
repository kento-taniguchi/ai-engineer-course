"use client";

// 登録済みの動画の冒頭から静止画を切り出し、サムネイルに設定する。
// 処理はすべてこのブラウザ内で行い、外部には送信しない。

import { useEffect, useRef, useState } from "react";
import type { MediaRef } from "@/lib/types";
import { THUMB_MAX_SIDE, formatBytes } from "@/services/mediaStore";
import { useMediaUrl } from "./Media";

const MAX_START_SEC = 15; // 冒頭付近として選べる範囲
const LOAD_TIMEOUT_MS = 15000;

export interface CapturedFrame {
  blob: Blob;
  width: number;
  height: number;
  sec: number;
  dark: boolean;
}

function videoErrorReason(v: HTMLVideoElement): string {
  const code = v.error?.code;
  if (code === 4 || code === 3)
    return "このブラウザでは再生できない動画形式のため、画像を切り出せません（例：iPhoneで撮影したHEVC/H.265の動画をWindowsのブラウザで開いた場合など）。下の「画像を選択」から手動で設定してください。";
  if (code === 2) return "動画の読み込み中にエラーが発生しました。";
  if (code === 1) return "動画の読み込みが中断されました。";
  return "動画を読み込めませんでした。";
}

function waitFor(v: HTMLVideoElement, event: string, ms = LOAD_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => {
      cleanup();
      reject(new Error("動画の読み込みに時間がかかりすぎました。ファイルが大きいか、形式に対応していない可能性があります。"));
    }, ms);
    const ok = () => {
      cleanup();
      resolve();
    };
    const ng = () => {
      cleanup();
      reject(new Error(videoErrorReason(v)));
    };
    const cleanup = () => {
      window.clearTimeout(t);
      v.removeEventListener(event, ok);
      v.removeEventListener("error", ng);
    };
    v.addEventListener(event, ok, { once: true });
    v.addEventListener("error", ng, { once: true });
  });
}

/** 平均の明るさ（0〜255）。黒画面の判定に使う */
function brightness(canvas: HTMLCanvasElement): number {
  const s = document.createElement("canvas");
  s.width = 32;
  s.height = 18;
  const x = s.getContext("2d")!;
  x.drawImage(canvas, 0, 0, 32, 18);
  const d = x.getImageData(0, 0, 32, 18).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return sum / (d.length / 4);
}

export function VideoFrameCapture({ video, onUse, busy }: { video?: MediaRef; onUse: (f: CapturedFrame) => void; busy: boolean }) {
  const media = useMediaUrl(video);
  const ref = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [sec, setSec] = useState(0.5);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [frame, setFrame] = useState<(CapturedFrame & { url: string }) | null>(null);

  // 動画の読み込み（長さの取得）
  useEffect(() => {
    const v = ref.current;
    if (!v || media.status !== "ready") return;
    let cancelled = false;
    setReady(false);
    setError(null);
    (async () => {
      try {
        if (v.readyState < 1) await waitFor(v, "loadedmetadata");
        let d = v.duration;
        // 一部の動画（録画アプリ等）は長さが「不明」になるため、末尾へ移動して長さを確定させる
        if (!Number.isFinite(d)) {
          v.currentTime = 1e7;
          await waitFor(v, "durationchange", 5000).catch(() => undefined);
          d = Number.isFinite(v.duration) ? v.duration : MAX_START_SEC;
        }
        if (v.readyState < 2) {
          v.currentTime = Math.min(0.5, d / 2);
          await waitFor(v, "seeked");
        }
        if (!v.videoWidth) throw new Error("映像が見つかりませんでした（音声のみのファイルの可能性があります）。");
        if (cancelled) return;
        setDuration(d);
        setSec(Math.min(0.5, d / 2));
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "動画を読み込めませんでした。");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [media.status]);

  // スライダーを動かしたら、その時刻の映像を表示
  useEffect(() => {
    const v = ref.current;
    if (v && ready) v.currentTime = sec;
  }, [sec, ready]);

  useEffect(() => () => {
    if (frame) URL.revokeObjectURL(frame.url);
  }, [frame]);

  const capture = async () => {
    const v = ref.current;
    if (!v) return;
    setCapturing(true);
    setError(null);
    try {
      if (Math.abs(v.currentTime - sec) > 0.01 || v.seeking) {
        v.currentTime = sec;
        await waitFor(v, "seeked");
      }
      const scale = Math.min(1, THUMB_MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(v.videoWidth * scale);
      c.height = Math.round(v.videoHeight * scale);
      c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
      const dark = brightness(c) < 20;
      const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("画像への変換に失敗しました。"))), "image/jpeg", 0.85));
      setFrame({ blob, width: c.width, height: c.height, sec, dark, url: URL.createObjectURL(blob) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "画像を切り出せませんでした。");
    } finally {
      setCapturing(false);
    }
  };

  if (!video) return <p className="small muted">動画を登録すると、動画の冒頭からサムネイルを作れます。</p>;
  if (!video.stored)
    return (
      <div className="notice notice-warn small" role="note">
        ⚠ 動画本体がこのブラウザに保存されていない（ファイル名のみの登録）ため、サムネイルを作れません。動画をブラウザ内に登録するか、画像を手動で選んでください。
      </div>
    );
  if (media.status === "missing")
    return (
      <div className="notice notice-danger small" role="alert">
        ⚠ 登録済みの動画がこのブラウザ内に見つからないため、サムネイルを作れません。
      </div>
    );

  const max = Math.min(MAX_START_SEC, duration ?? MAX_START_SEC);
  return (
    <div className="stack">
      <div className="grid-2" style={{ gap: 12 }}>
        <div>
          <p className="xs muted" style={{ marginBottom: 4 }}>
            動画（{video.fileName}）
          </p>
          {media.status === "ready" ? (
            <video ref={ref} src={media.url} muted playsInline preload="auto" style={{ width: "100%", aspectRatio: "16 / 9", background: "#000", borderRadius: 6 }} aria-label="切り出す位置の映像" />
          ) : (
            <div className="empty">読み込み中…</div>
          )}
        </div>
        <div>
          <p className="xs muted" style={{ marginBottom: 4 }}>
            切り出した画像（プレビュー）
          </p>
          {frame ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={frame.url} alt={`動画の${frame.sec.toFixed(1)}秒の画像`} style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 6, border: "2px dashed var(--gold)" }} />
          ) : (
            <div className="empty" style={{ aspectRatio: "16 / 9", display: "flex", alignItems: "center", justifyContent: "center" }}>
              まだ切り出していません
            </div>
          )}
        </div>
      </div>

      <label className="field">
        切り出す時刻：{sec.toFixed(1)}秒{duration ? `（動画の長さ 約${Math.round(duration)}秒）` : ""}
        <input type="range" min={0} max={max} step={0.1} value={sec} disabled={!ready} onChange={(e) => setSec(Number(e.target.value))} />
      </label>
      <div className="row" style={{ gap: 4 }}>
        {[0, 0.5, 1, 2, 3].filter((x) => x <= max).map((x) => (
          <button key={x} className="chip" aria-pressed={Math.abs(sec - x) < 0.05} disabled={!ready} onClick={() => setSec(x)}>
            {x}秒
          </button>
        ))}
      </div>
      {error && (
        <div className="notice notice-danger small" role="alert">
          ⚠ サムネイルを作れませんでした：{error}
        </div>
      )}
      {frame?.dark && (
        <div className="notice notice-warn small" role="status">
          ! 画面が暗い（黒い）可能性があります。時刻を少し後ろにずらして切り出し直してください。
        </div>
      )}
      <div className="row">
        <button className="btn" disabled={!ready || capturing} onClick={capture}>
          {capturing ? "切り出し中…" : "この時刻の画像を切り出す"}
        </button>
        <button className="btn btn-primary" disabled={!frame || busy} onClick={() => frame && onUse(frame)}>
          {busy ? "保存中…" : "サムネイルに設定"}
        </button>
        {frame && <span className="xs muted">{frame.width}×{frame.height}px／{formatBytes(frame.blob.size)}・まだ保存していません</span>}
      </div>
    </div>
  );
}
