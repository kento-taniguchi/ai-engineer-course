// 音声入力・AIによるフィードバック下書き作成（試作版はデモ実装）。
//
// 将来の実装方針:
//  - SpeechService: 端末の音声認識 or 音声認識API で文字起こし
//  - splitIntoFields: AI API に「項目ごとに振り分け、書かれていない項目は空欄にする」よう指示
// 現在は、マイクも外部APIも使わず、サンプル文章とキーワードによる簡易振り分けで動作を再現します。

import type { Report } from "@/lib/types";

export type FieldKey = "purpose" | "content" | "measurements" | "homework" | "nextPoints" | "notes";
export type FieldDraft = Partial<Record<FieldKey, string>>;

export interface SpeechService {
  readonly isDemo: boolean;
  transcribe(): Promise<string>;
}

export const SAMPLE_TRANSCRIPT =
  "今日の課題はリリースポイントの安定です。" +
  "指導内容はタオルシャドーでリリース位置を確認して、その後ネットスローを30球行いました。" +
  "測定は球速が106キロでした。" +
  "自主練習はタオルシャドーを20回2セット、それと股関節ストレッチを毎日続けてください。" +
  "次回までのポイントは、踏み出した足のつま先をキャッチャー方向に向けることです。";

export const demoSpeechService: SpeechService = {
  isDemo: true,
  async transcribe() {
    await new Promise((r) => setTimeout(r, 800));
    return SAMPLE_TRANSCRIPT;
  },
};

const RULES: { key: FieldKey; patterns: RegExp[] }[] = [
  { key: "purpose", patterns: [/課題/, /目的/, /目標/] },
  { key: "content", patterns: [/指導内容/, /行いました/, /練習内容/, /ドリル/] },
  { key: "measurements", patterns: [/測定/, /球速/, /キロ/, /km/, /秒/, /握力/] },
  { key: "homework", patterns: [/自主練/, /宿題/, /家で/] },
  { key: "nextPoints", patterns: [/次回/, /ポイント/] },
  { key: "notes", patterns: [/備考/, /その他/, /連絡/] },
];

const PREFIX = /^(今日の)?(課題|目的|目標|指導内容|測定(結果)?|自主練習?|宿題|次回までのポイント|次回|備考|その他)(は|として|では|：|:)?[、,]?/;

/**
 * 文章を文単位に分け、キーワードで項目に振り分ける（デモ）。
 * どの項目にも当てはまらない文は「備考」には入れず、未振り分けとして返す（勝手に補完しない）。
 */
export function splitIntoFields(text: string): { fields: FieldDraft; unassigned: string[] } {
  const sentences = text
    .split(/(?<=[。．！？!?\n])/)
    .map((s) => s.trim())
    .filter(Boolean);
  const fields: FieldDraft = {};
  const unassigned: string[] = [];
  for (const s of sentences) {
    const rule = RULES.find((r) => r.patterns.some((p) => p.test(s)));
    if (!rule) {
      unassigned.push(s);
      continue;
    }
    const cleaned = s.replace(PREFIX, "").replace(/。$/, "").trim();
    fields[rule.key] = fields[rule.key] ? `${fields[rule.key]}\n${cleaned}` : cleaned;
  }
  return { fields, unassigned };
}

export function emptyReportFields(): Pick<Report, FieldKey> {
  return { purpose: "", content: "", measurements: "", homework: "", nextPoints: "", notes: "" };
}
