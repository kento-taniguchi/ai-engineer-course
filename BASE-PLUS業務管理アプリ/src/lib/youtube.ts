// YouTubeのURLの確認と整形（通信はしない）。
// YouTubeアプリの「共有 → コピー」で得られるURL（https://youtu.be/ID?si=…）や、
// ブラウザのURL（https://www.youtube.com/watch?v=ID）、ショート・ライブのURLを受け付ける。
// 共有用の追跡情報（si= など）は取り除き、https://youtu.be/ID の形で保存する。

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

export type YouTubeParse = { ok: true; videoId: string; url: string } | { ok: false; error: string };

export function parseYouTubeUrl(input: string): YouTubeParse {
  const s = input.trim();
  if (!s) return { ok: false, error: "URLを貼り付けてください" };
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return { ok: false, error: "URLの形式ではありません" };
  }
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\.|^music\./, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = u.pathname.split("/")[1] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(shorts|live|embed|v)\/([^/?#]+)/);
      if (m) id = m[2];
    }
  } else {
    return { ok: false, error: "YouTubeのURLではありません（youtube.com または youtu.be のURLを貼り付けてください）" };
  }
  if (!id || !ID_RE.test(id)) return { ok: false, error: "動画のURLではないようです（チャンネルや再生リストではなく、動画の共有URLを貼り付けてください）" };
  return { ok: true, videoId: id, url: `https://youtu.be/${id}` };
}

/** サムネイル画像（YouTubeが公開している画像のURL。限定公開の動画でも表示される） */
export function youtubeThumb(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/** 公式LINEで送る文面（テーマと動画のURL） */
export function seminarLineText(theme: string, url: string | undefined): string {
  return [
    "【BASE-PLUS プチセミナー】",
    theme ? `今回のテーマは「${theme}」です。` : "",
    url ? `▼動画はこちら（限定公開）\n${url}` : "",
    "ぜひご覧ください！",
  ]
    .filter(Boolean)
    .join("\n");
}
