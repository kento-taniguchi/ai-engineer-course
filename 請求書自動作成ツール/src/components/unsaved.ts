// 未保存の出欠があるときに、別の画面へ移る前に確認するための小さな仕組み
let dirty = false;

export const UNSAVED_MESSAGE = "保存していない変更があります。保存せずに移動しますか？";

export function setUnsaved(v: boolean) {
  dirty = v;
}

/** 移動してよければ true */
export function confirmLeave(): boolean {
  if (!dirty) return true;
  const ok = window.confirm(UNSAVED_MESSAGE);
  if (ok) dirty = false;
  return ok;
}
