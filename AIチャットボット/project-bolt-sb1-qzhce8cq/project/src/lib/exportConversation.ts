import type { Message } from "@/types";

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/** 会話をMarkdown形式の文章にする */
export function conversationToMarkdown(title: string, messages: Message[], botName: string, youLabel: string): string {
  const lines = [`# ${title}`, "", `${botName}（${formatDateTime(new Date().toISOString())}）`, ""];
  for (const m of messages) {
    lines.push("---", "", `**${m.role === "user" ? youLabel : botName}**（${formatDateTime(m.created_at)}）`, "", m.content, "");
  }
  return lines.join("\n");
}

/** 会話をMarkdownファイル（.md）としてダウンロードする */
export function downloadConversation(title: string, messages: Message[], botName: string, youLabel: string) {
  const text = conversationToMarkdown(title, messages, botName, youLabel);
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 50) || "chat";
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeTitle}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
