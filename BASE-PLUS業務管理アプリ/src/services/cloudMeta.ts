// この端末とクラウドの同期の記録（このブラウザの localStorage に保存）。
// 「最後に同期したクラウドの版番号」と「そのときの内容の指紋」で、どちらに変更があったかを判定する。

import type { AppData } from "@/lib/types";

const META_KEY = "baseplus-cloud-meta";
const AUTO_KEY = "baseplus-cloud-auto";

export interface CloudMeta {
  userId: string;
  /** この端末が最後に読み込んだ・保存したクラウドの版番号 */
  revision: number;
  /** そのときの内容の指紋（未保存の変更があるかの判定） */
  fingerprint: string;
  syncedAt: string;
}

export function loadMeta(userId: string): CloudMeta | null {
  try {
    const m = JSON.parse(window.localStorage.getItem(META_KEY) ?? "null") as CloudMeta | null;
    return m && m.userId === userId ? m : null;
  } catch {
    return null;
  }
}

export function saveMeta(m: CloudMeta | null): void {
  try {
    if (m) window.localStorage.setItem(META_KEY, JSON.stringify(m));
    else window.localStorage.removeItem(META_KEY);
  } catch {
    /* 保存できなくても動作は続ける（次回は版番号の確認からやり直す） */
  }
}

/** 自動同期のオン・オフ（初期値：オン） */
export function loadAutoSync(): boolean {
  try {
    return window.localStorage.getItem(AUTO_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveAutoSync(on: boolean): void {
  try {
    window.localStorage.setItem(AUTO_KEY, on ? "on" : "off");
  } catch {
    /* 何もしない */
  }
}

export function deviceLabel(): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Macintosh/.test(ua)) return "Mac";
  return "その他の端末";
}

export function downloadJson(d: AppData, name: string): void {
  const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
