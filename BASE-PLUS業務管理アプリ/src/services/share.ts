// 文章のコピー・共有。
// iPhone等では端末の共有機能（Web Share API）からLINE・メール等を選べます。
// どのアプリに共有できるかは端末・アプリの対応状況によるため、特定サービスを保証しません。

export function canNativeShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 下の方法を試す */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export type ShareResult = "opened" | "cancelled" | "unsupported" | "error";

/** 共有画面を開く。※開いただけでは「送信済み」にしない */
export async function shareText(text: string, title = "BASE-PLUS"): Promise<ShareResult> {
  if (!canNativeShare()) return "unsupported";
  try {
    await navigator.share({ title, text });
    return "opened";
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    return "error";
  }
}

export function mailtoHref(text: string, subject = "BASE-PLUSより"): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}

/** LINEの共有URL（LINEアプリが入っている端末で開く想定。動作は環境に依存） */
export function lineShareHref(text: string): string {
  return `https://line.me/R/share?text=${encodeURIComponent(text)}`;
}
