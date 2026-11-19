// 連絡メッセージ（リマインド・お礼・フィードバック）の下書きテンプレート。

import type { AppData, Booking, Report } from "./types";
import { BOOKING_KIND_LABEL, targetName } from "./selectors";
import { formatDate, formatTime, dateKeyOf } from "./time";

function lessonName(b: Booking): string {
  if (b.kind === "team") return "チームサポート";
  if (b.kind === "online") return "オンライン指導";
  if (b.kind === "trial") return "体験指導";
  return "パーソナル指導";
}

export function reminderDraft(data: AppData, b: Booking): string {
  const name = targetName(data, b.target);
  const place = b.kind === "online" ? "開始時刻になりましたら、お送りしたURLからご参加ください。" : "お気をつけてお越しください。";
  return [
    `${name} 様`,
    "",
    "こんにちは！",
    `本日${formatTime(b.start)}からBASE-PLUSの${lessonName(b)}をよろしくお願いいたします。`,
    place,
  ].join("\n");
}

export function thanksDraft(data: AppData, b: Booking): string {
  const name = targetName(data, b.target);
  const verb = b.kind === "team" ? "ご一緒させていただき" : b.kind === "online" ? "ご参加いただき" : "お越しいただき";
  return [
    `${name} 様`,
    "",
    `本日はBASE-PLUSの${lessonName(b)}に${verb}、ありがとうございました！`,
    "本日の内容はフィードバックとしてまとめてお送りします。",
    "引き続き、よろしくお願いいたします。",
  ].join("\n");
}

export const REPORT_FIELDS: { key: keyof Pick<Report, "purpose" | "content" | "measurements" | "homework" | "nextPoints" | "notes">; label: string }[] = [
  { key: "purpose", label: "今回の目的・課題" },
  { key: "content", label: "指導内容" },
  { key: "measurements", label: "測定結果" },
  { key: "homework", label: "自主練習" },
  { key: "nextPoints", label: "次回までのポイント" },
  { key: "notes", label: "備考" },
];

/** レポートを共有用テキストに変換（未入力の項目は出力しない） */
export function reportText(data: AppData, r: Report, b?: Booking): string {
  const lines: string[] = [
    "【BASE-PLUS フィードバック】",
    `指導日：${formatDate(r.date)}${b ? ` ${formatTime(b.start)}〜` : ""}`,
    `対象：${targetName(data, r.target)}${b ? `（${BOOKING_KIND_LABEL[b.kind]}）` : ""}`,
  ];
  for (const f of REPORT_FIELDS) {
    const v = r[f.key].trim();
    if (!v) continue;
    lines.push("", `■ ${f.label}`, v);
  }
  return lines.join("\n");
}

export function lessonDateLabel(b: Booking): string {
  return `${formatDate(dateKeyOf(b.start))} ${formatTime(b.start)}`;
}
