"use client";

import { useEffect, useState } from "react";
import type { MediaRef } from "@/lib/types";
import { loadMedia } from "@/services/mediaStore";

export type MediaState = { status: "none" | "loading" | "missing" } | { status: "ready"; url: string };

/** ブラウザ内（IndexedDB）に保存したファイルを読み出して表示用URLにする */
export function useMediaUrl(ref?: MediaRef): MediaState {
  const [state, setState] = useState<MediaState>({ status: ref?.stored ? "loading" : "none" });
  const id = ref?.stored ? ref.id : null;
  useEffect(() => {
    if (!id) {
      setState({ status: "none" });
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    setState({ status: "loading" });
    loadMedia(id).then((blob) => {
      if (cancelled) return;
      if (!blob) return setState({ status: "missing" });
      url = URL.createObjectURL(blob);
      setState({ status: "ready", url });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  return state;
}

export function ThumbnailView({ media, alt, small = false }: { media?: MediaRef; alt: string; small?: boolean }) {
  const st = useMediaUrl(media);
  const box: React.CSSProperties = {
    aspectRatio: "16 / 9",
    width: "100%",
    borderRadius: 6,
    overflow: "hidden",
    border: "1px solid var(--border)",
    background: "repeating-linear-gradient(45deg, #eef1f6, #eef1f6 8px, #f7f8fb 8px, #f7f8fb 16px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--muted)",
    fontSize: small ? 10 : 13,
    textAlign: "center",
    padding: 4,
  };
  if (st.status === "ready") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={st.url} alt={alt} style={{ ...box, objectFit: "cover", padding: 0, display: "block" }} />;
  }
  return (
    <div style={box} role="img" aria-label={alt}>
      {st.status === "loading" ? "読み込み中…" : st.status === "missing" ? "⚠ 画像データが見つかりません" : "サムネイル未登録"}
    </div>
  );
}
