// 発信・SNSのAI支援（テーマ候補の提案・投稿文の下書き）の窓口。
//
// 【接続先は未確定】
//  要望にある「Muse」がどのサービスを指すかは現時点で未確認のため、特定のサービスには接続していません。
//  APIの有無・機能・利用条件を確認したうえで、ContentAssistProvider を実装して差し替えます。
//  （詳細は docs/仕様メモ.md「発信・SNSのAI支援」を参照）
//
// 現在はデモ実装です。テーマ候補は架空のサンプル、投稿文は入力内容をテンプレートに当てはめただけで、
// AIによる生成・要約は行っていません。

import type { SnsAudience } from "@/lib/types";

export const AUDIENCE_LABEL: Record<SnsAudience, string> = {
  player: "野球選手",
  parent: "保護者",
  coach: "指導者",
};

export interface CaptionInput {
  theme: string;
  audience: SnsAudience;
  videoContent: string;
}

export interface CaptionDraft {
  hook: string;
  summary: string;
  message: string;
  hashtags: string[];
}

export interface ContentAssistProvider {
  readonly isDemo: boolean;
  readonly label: string;
  suggestThemes(audience: SnsAudience): Promise<string[]>;
  draftCaption(input: CaptionInput): Promise<CaptionDraft>;
}

const SAMPLE_THEMES: Record<SnsAudience, string[]> = {
  player: [
    "投球後に行いたい前腕のケア",
    "球速アップを目指す選手の下半身トレーニング",
    "野球選手が確認したい肩の動き",
    "キャッチボールで意識したい3つのポイント",
    "自宅でできる股関節ストレッチ",
  ],
  parent: [
    "練習後に子どもの体で確認したいこと",
    "成長期の投げすぎを防ぐために知っておきたいこと",
    "家でできる親子キャッチボールのコツ",
    "野球をする子どもの食事で意識したいこと",
  ],
  coach: [
    "少人数でもできるウォームアップメニュー",
    "投手の疲労を確認するチェックポイント",
    "低学年に伝わりやすい投げ方の教え方",
    "練習の最後に入れたいクールダウン",
  ],
};

const MESSAGE: Record<SnsAudience, string> = {
  player: "練習の前後にぜひ試してみてください。",
  parent: "お子さんと一緒にチェックしてみてください。",
  coach: "チームの練習メニューの参考にしてみてください。",
};

const AUDIENCE_TAGS: Record<SnsAudience, string[]> = {
  player: ["#野球練習", "#自主練"],
  parent: ["#少年野球", "#野球ママ", "#野球パパ"],
  coach: ["#野球指導", "#少年野球指導者"],
};

const KEYWORD_TAGS: [RegExp, string][] = [
  [/球速/, "#球速アップ"],
  [/肩/, "#肩のケア"],
  [/前腕|ケア|疲労/, "#コンディショニング"],
  [/下半身|股関節/, "#下半身トレーニング"],
  [/投球|投げ|ピッチ|投手/, "#ピッチング"],
  [/打撃|バッティング|スイング/, "#バッティング"],
  [/ストレッチ/, "#ストレッチ"],
  [/キャッチボール/, "#キャッチボール"],
];

export function captionToText(d: CaptionDraft): string {
  return [d.hook, d.summary, d.message, d.hashtags.join(" ")].filter((s) => s.trim()).join("\n\n");
}

export const demoContentAssist: ContentAssistProvider = {
  isDemo: true,
  label: "デモ（AI未接続・接続先未確定）",
  async suggestThemes(audience) {
    await new Promise((r) => setTimeout(r, 500));
    return SAMPLE_THEMES[audience];
  },
  async draftCaption({ theme, audience, videoContent }) {
    await new Promise((r) => setTimeout(r, 500));
    const hashtags = ["#BASEPLUS", "#野球", "#野球トレーニング", ...AUDIENCE_TAGS[audience]];
    for (const [re, tag] of KEYWORD_TAGS) if (re.test(theme + videoContent) && !hashtags.includes(tag)) hashtags.push(tag);
    return {
      hook: theme.trim() ? `【${theme.trim()}】` : "",
      // AIで要約できないため、本人が入力した内容をそのまま使う（勝手に内容を足さない）
      summary: videoContent.trim(),
      message: MESSAGE[audience],
      hashtags,
    };
  },
};

// ======================================================================
// 参考リールから台本・撮影カットを作る（第3版）
// ======================================================================
//
// 【参考動画の読み取りについて（調査結果）】
//  - InstagramのURLだけでは、動画の中身（映像・音声・字幕）をこのアプリから取得できません。
//    ・Instagramの公式API（Instagram API / Graph API）で取得できるのは、原則として自分のアカウントの投稿
//    ・oEmbed（埋め込み）は表示専用で、Metaのアプリ審査とアクセストークンが必要。動画の中身は返さない
//      （2025年11月以降はサムネイル等の項目も返さない）
//    ・ページの自動取得（スクレイピング）はログインが必要な場合が多く、利用規約上も避けるべき
//  - そのため、参考動画の内容・文字起こし・構成は本人が見て入力し、それを参考に下書きを作る方式にしています。
//  - 将来、自分で保存した動画ファイルを解析する場合は、動画入力に対応したAI（映像・音声を扱えるモデル）と、
//    文字起こし（音声認識）が必要です。接続先は未確定です。

export interface ReelPlanInput {
  theme: string;
  audience: SnsAudience;
  message: string;
  lengthSec: number;
  extraNotes: string;
  styleNote: string;
  /** 参考動画について本人が入力したメモ（構成の参考にするだけで、文章はそのまま使わない） */
  referenceNotes: string;
}

export interface ReelShot {
  visual: string;
  words: string;
  seconds: number;
}

export interface ReelPlanDraft {
  hook: string;
  script: string;
  shots: ReelShot[];
  caption: string;
  notices: string[];
}

export interface ReelPlanProvider {
  readonly isDemo: boolean;
  readonly label: string;
  /** 参考動画の中身を読み取れるか（現在は不可） */
  readonly canAnalyzeVideo: boolean;
  draftReelPlan(input: ReelPlanInput): Promise<ReelPlanDraft>;
}

const INSTAGRAM_URL = /^https:\/\/(www\.)?(instagram\.com|instagr\.am)\/(reel|reels|p|tv)\/[A-Za-z0-9_-]+\/?(\?[^\s]*)?$/;

/** InstagramのリールURLとして正しい形か確認する（内容が存在するかまでは確認しない） */
export function validateInstagramUrl(url: string): { ok: true } | { ok: false; reason: string } {
  const u = url.trim();
  if (!u) return { ok: false, reason: "URLが入力されていません" };
  if (!/^https?:\/\//.test(u)) return { ok: false, reason: "https:// から始まるURLを入力してください" };
  if (/^http:\/\//.test(u)) return { ok: false, reason: "http ではなく https のURLを入力してください" };
  if (!/^https:\/\/(www\.)?(instagram\.com|instagr\.am)\//.test(u)) return { ok: false, reason: "InstagramのURL（instagram.com）ではありません" };
  if (!INSTAGRAM_URL.test(u)) return { ok: false, reason: "リール・投稿のURLの形ではありません（例：https://www.instagram.com/reel/XXXX/）" };
  return { ok: true };
}

const HOOK: Record<SnsAudience, (t: string) => string> = {
  player: (t) => `「${t}」、できていますか？`,
  parent: (t) => `お子さんの「${t}」、気にしたことはありますか？`,
  coach: (t) => `指導者の方へ。「${t}」、チームで取り入れていますか？`,
};

function splitPoints(message: string): string[] {
  return message
    .split(/[。\n]/)
    .map((s) => s.replace(/^[・\-\s0-9０-９.、]+/, "").trim())
    .filter(Boolean)
    .slice(0, 4);
}

export const demoReelPlanner: ReelPlanProvider = {
  isDemo: true,
  label: "デモ（AI未接続・動画解析なし）",
  canAnalyzeVideo: false,
  async draftReelPlan(input) {
    await new Promise((r) => setTimeout(r, 500));
    const theme = input.theme.trim();
    const points = splitPoints(input.message);
    const total = Math.max(15, Math.min(90, input.lengthSec || 30));
    const fixed = 3 + 3 + 4;
    const per = Math.max(3, Math.round((total - fixed) / Math.max(1, points.length)));
    const hook = HOOK[input.audience](theme);
    const intro = "福井で野球のパーソナル指導をしている、BASE-PLUSの谷口です。";
    const closing = "参考になったら保存して、練習のときに見返してください。";

    const scriptLines = [
      `【フック 0〜3秒】`,
      hook,
      ``,
      `【あいさつ 〜6秒】`,
      intro,
      ``,
      `【本題】`,
      ...points.map((p, i) => `ポイント${i + 1}（約${per}秒）：${p}`),
      ``,
      `【締め 約4秒】`,
      closing,
    ];
    if (input.extraNotes.trim()) scriptLines.push("", `【補足メモ（反映するか確認）】`, input.extraNotes.trim());

    const shots: ReelShot[] = [
      { visual: "谷口さんの顔〜胸のアップ（正面・明るい場所）", words: `${hook}（テロップでも表示）`, seconds: 3 },
      { visual: "上半身（BASE-PLUSの練習場を背景に）", words: `${intro}／テロップ「BASE-PLUS 谷口」`, seconds: 3 },
      ...points.map((p, i) => ({ visual: `ポイント${i + 1}の実演（全身・横から）。必要なら手元・足元のアップを追加`, words: p, seconds: per })),
      { visual: "谷口さん正面（最初と同じ場所）", words: `${closing}（テロップ「保存してね」）`, seconds: 4 },
    ];

    const cap = await demoContentAssist.draftCaption({ theme, audience: input.audience, videoContent: input.message });
    const notices = [
      "デモの下書きです。AIは使っておらず、入力内容をテンプレートに当てはめています。",
      "参考動画の中身は読み取っていません（分析していません）。",
      "医学・トレーニングに関する内容は確認されていません。必ずご自身で確認・修正してください。",
    ];
    if (input.referenceNotes.trim()) notices.push("参考動画のメモは、デモでは文章に使っていません（参考動画の表現をそのまま複製しないため）。");
    if (input.styleNote.trim()) notices.push("話し方のメモは、実際のAIに接続したときに使う想定です（デモでは未反映）。");
    return { hook, script: scriptLines.join("\n"), shots, caption: captionToText(cap), notices };
  },
};

export function shotsToText(shots: { visual: string; words: string; seconds?: number }[]): string {
  return shots
    .map((s, i) => `カット${i + 1}${s.seconds ? `（約${s.seconds}秒）` : ""}\n映すもの：${s.visual}\n話す内容・表示する言葉：${s.words}`)
    .join("\n\n");
}
