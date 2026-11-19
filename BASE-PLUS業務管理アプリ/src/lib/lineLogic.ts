// 公式LINEの自動返信・一斉送信のルール（通信はしない。自動テストで確認する）。

import type { DateKey, SeminarEpisode } from "./types";
import { seminarLineText } from "./youtube";
import { formatDate } from "./time";

export const LINE_KEYWORD_SUBSCRIBE = "セミナー";
export const LINE_KEYWORD_STOP = "配信停止";
/** Messaging API の一斉送信（multicast）で1回に送れる人数の上限 */
export const LINE_MULTICAST_MAX = 500;

export type LineIntent = "subscribe" | "stop" | "other";

/** 届いた文章の意味（申込・停止・それ以外）。それ以外は返信しない（公式アカウントのチャットで本人が対応） */
export function classifyLineText(text: string): LineIntent {
  const t = text.replace(/[\s　]/g, "");
  if (t.includes(LINE_KEYWORD_STOP) || t === "停止") return "stop";
  if (t.includes(LINE_KEYWORD_SUBSCRIBE)) return "subscribe";
  return "other";
}

type Ep = Pick<SeminarEpisode, "id" | "deliveryDate" | "theme" | "youtubeUrl" | "lineDraft">;

/** 返信で案内する回：配信日を迎えた回のうち、YouTubeのURLがある最新の回 */
export function latestDeliveredEpisode<T extends Ep>(seminars: T[], today: DateKey): T | null {
  return (
    seminars
      .filter((s) => !!s.youtubeUrl && s.deliveryDate <= today)
      .sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate))[0] ?? null
  );
}

/** 次の配信日（今日より後で、いちばん近い回） */
export function nextEpisode<T extends Ep>(seminars: T[], today: DateKey): T | null {
  return seminars.filter((s) => s.deliveryDate > today).sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate))[0] ?? null;
}

/** 今日が配信日で、URLが登録されている回（一斉送信の対象） */
export function episodesToDeliver<T extends Ep>(seminars: T[], today: DateKey): T[] {
  return seminars.filter((s) => s.deliveryDate === today && !!s.youtubeUrl);
}

const FOOTER = `※配信の停止は「${LINE_KEYWORD_STOP}」と送ってください。`;

/** 一斉送信の文面：配信予約の下書き（URL入り）があればそれを使い、なければテンプレート */
export function deliveryText(ep: Ep): string {
  const base = ep.lineDraft?.text && ep.youtubeUrl && ep.lineDraft.text.includes(ep.youtubeUrl) ? ep.lineDraft.text : seminarLineText(ep.theme, ep.youtubeUrl);
  return `${base}\n\n${FOOTER}`;
}

/** 「セミナー」と送ってきた人への返信 */
export function subscribeReply(seminars: Ep[], today: DateKey, firstTime: boolean): string {
  const ep = latestDeliveredEpisode(seminars, today);
  const next = nextEpisode(seminars, today);
  const lines: string[] = [];
  if (ep) {
    lines.push(seminarLineText(ep.theme, ep.youtubeUrl));
  } else {
    lines.push("【BASE-PLUS プチセミナー】", "ただいま動画を準備中です。");
  }
  if (firstTime) {
    lines.push("", `お申し込みありがとうございます。${next ? `次回（${formatDate(next.deliveryDate)}）から、` : ""}新しい回の配信日にもURLをお送りします。`);
  }
  lines.push("", FOOTER);
  return lines.join("\n");
}

export function stopReply(): string {
  return `配信を停止しました。再開するときは「${LINE_KEYWORD_SUBSCRIBE}」と送ってください。`;
}

export function chunk<T>(list: T[], size = LINE_MULTICAST_MAX): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** 今月の残り通数が足りるか（上限なしのプランは常に足りる） */
export function quotaAllows(quota: { type: "none" | "limited"; value?: number }, used: number, recipients: number): { ok: boolean; remaining: number | null } {
  if (quota.type === "none") return { ok: true, remaining: null };
  const remaining = Math.max(0, (quota.value ?? 0) - used);
  return { ok: recipients <= remaining, remaining };
}
