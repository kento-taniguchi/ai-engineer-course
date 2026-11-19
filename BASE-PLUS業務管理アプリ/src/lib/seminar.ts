import type { SeminarStatus } from "./types";

export const SEMINAR_STATUS: Record<SeminarStatus, { label: string; icon: string; cls: string }> = {
  no_theme: { label: "テーマ未決定", icon: "○", cls: "status-todo" },
  making: { label: "動画作成中", icon: "▶", cls: "status-doing" },
  ready: { label: "動画準備完了", icon: "◉", cls: "status-scheduled" },
  waiting_reserve: { label: "配信予約待ち", icon: "◷", cls: "status-scheduled" },
  delivered: { label: "配信済み", icon: "✓", cls: "status-done" },
};
