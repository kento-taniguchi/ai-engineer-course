// 画像・動画ファイルの保存先（試作版）。
//
// localStorage は約5MBしか使えず、画像・動画の保存には向かないため、
// ブラウザ内の IndexedDB にファイル本体を別保存します。
//
// 試作版での制約（画面にも表示）:
//  - このブラウザの中だけに保存。他の端末・ブラウザとは共有されない
//  - ブラウザのサイトデータ削除や、空き容量が少ないとき（特にiPhoneのSafari）に消えることがある
//  - 「データを書き出す（JSON）」には画像・動画は含まれない
//
// 本番での提案: クラウドのファイル保存（例: Supabase Storage / Firebase Storage / Google Drive）に
// アップロードし、アプリにはファイルのURLやIDだけを保存する。差し替えはこのファイルで行う。

const DB_NAME = "baseplus-media";
const STORE = "files";

/** 試作版で受け付ける動画の上限（ブラウザ内保存のため控えめに設定） */
export const VIDEO_MAX_BYTES = 300 * 1024 * 1024;
/** サムネイルは縮小して保存（長辺の最大ピクセル） */
export const THUMB_MAX_SIDE = 1280;

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)}GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(n / 1024))}KB`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("このブラウザではファイルを保存できません（IndexedDB非対応）"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("保存領域を開けませんでした"));
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        let result: T;
        req.onsuccess = () => (result = req.result as T);
        t.oncomplete = () => {
          db.close();
          resolve(result);
        };
        t.onerror = () => {
          db.close();
          reject(t.error ?? req.error ?? new Error("保存に失敗しました"));
        };
        t.onabort = () => {
          db.close();
          reject(t.error ?? new Error("保存が中断されました（容量不足の可能性があります）"));
        };
      }),
  );
}

export interface StorageEstimate {
  usage: number;
  quota: number;
  available: number;
}

export async function estimateStorage(): Promise<StorageEstimate | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e || e.quota === undefined) return null;
    const usage = e.usage ?? 0;
    return { usage, quota: e.quota, available: Math.max(0, e.quota - usage) };
  } catch {
    return null;
  }
}

export type SaveResult = { ok: true; storedBytes: number } | { ok: false; reason: string };

/** 保存し、読み戻してサイズが一致した場合のみ成功とする */
export async function saveMedia(id: string, blob: Blob): Promise<SaveResult> {
  try {
    const est = await estimateStorage();
    if (est && blob.size > est.available * 0.9) {
      return { ok: false, reason: `ブラウザの空き容量が不足しています（必要 ${formatBytes(blob.size)} / 空き 約${formatBytes(est.available)}）` };
    }
    await tx("readwrite", (s) => s.put(blob, id));
    const back = await loadMedia(id);
    if (!back || back.size !== blob.size) {
      await deleteMedia(id);
      return { ok: false, reason: "保存後の確認でファイルを読み出せませんでした" };
    }
    return { ok: true, storedBytes: back.size };
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "QuotaExceededError") return { ok: false, reason: "ブラウザの保存容量が不足しています" };
    return { ok: false, reason: e instanceof Error ? e.message : "保存に失敗しました" };
  }
}

export async function loadMedia(id: string): Promise<Blob | null> {
  try {
    const r = await tx<Blob | undefined>("readonly", (s) => s.get(id));
    return r ?? null;
  } catch {
    return null;
  }
}

export async function deleteMedia(id: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {
    /* 消せなくても画面側の登録は解除する */
  }
}

/** 画像を縮小してJPEGにする（保存容量を抑えるため） */
export async function resizeImage(file: File, maxSide = THUMB_MAX_SIDE): Promise<{ blob: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("画像を読み込めませんでした（対応していない形式の可能性があります）"));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.round(img.naturalWidth * scale);
    const height = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("画像の変換に失敗しました"))), "image/jpeg", 0.85),
    );
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** すべての画像・動画を削除（デモデータの初期化用） */
export async function clearAllMedia(): Promise<void> {
  try {
    await tx("readwrite", (s) => s.clear());
  } catch {
    /* 失敗しても初期化は続ける */
  }
}
