"use client";

import { useState } from "react";
import { useApp } from "@/store/AppStore";
import { canNativeShare, copyText, lineShareHref, mailtoHref, shareText } from "@/services/share";

/**
 * コピー・共有ボタン群。
 * 共有画面を開いても「送信済み」にはしません。実際に送ったあと、ユーザーが「送信済みにする」を押します。
 */
export function ShareBox({ text, subject }: { text: string; subject?: string }) {
  const { notify } = useApp();
  const [copied, setCopied] = useState(false);
  const native = canNativeShare();
  const empty = !text.trim();

  return (
    <div className="stack">
      <div className="row">
        <button
          className="btn btn-primary"
          disabled={empty}
          onClick={async () => {
            const ok = await copyText(text);
            if (ok) {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
              notify("文章をコピーしました");
            } else notify("コピーできませんでした。文章を長押しして選択してください", "error");
          }}
        >
          {copied ? "✓ コピーしました" : "文章をコピー"}
        </button>
        <button
          className="btn"
          disabled={empty || !native}
          onClick={async () => {
            const r = await shareText(text, subject);
            if (r === "opened") notify("共有画面を開きました。送信後に「送信済みにする」を押してください", "info");
            else if (r === "cancelled") notify("共有をキャンセルしました", "info");
            else if (r === "error") notify("共有画面を開けませんでした", "error");
          }}
        >
          端末の共有機能
        </button>
        <a className="btn" href={empty ? undefined : mailtoHref(text, subject)} aria-disabled={empty}>
          メールで開く
        </a>
        <a className="btn" href={empty ? undefined : lineShareHref(text)} target="_blank" rel="noopener noreferrer" aria-disabled={empty}>
          LINEで開く
        </a>
      </div>
      <p className="xs muted">
        {native ? "" : "この端末・ブラウザでは端末の共有機能を利用できません（iPhoneのSafari等では利用できます）。"}
        LINE・メール・Instagramなど、共有できるアプリや内容は端末やアプリの対応状況によって異なります。共有画面を開いただけでは送信済みになりません。
      </p>
    </div>
  );
}
