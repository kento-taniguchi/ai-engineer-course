import { useState } from "react";
import { CalendarCheck, Check, Copy, CornerDownRight, RefreshCw } from "lucide-react";
import type { Message } from "@/types";
import { Markdown } from "@/components/Markdown";
import { BrandMark } from "@/components/BrandMark";
import { useI18n } from "@/lib/i18n";

interface ChatMessageProps {
  message: Message;
  /** 最後の回答のときだけ「作り直す」ボタンを出す */
  onRegenerate?: () => void;
  /** 次の質問の候補（最後の回答のときだけ） */
  followUps?: string[];
  onAsk?: (text: string) => void;
  /** 予約の話題だったときに「予約する」を出す */
  onReserve?: () => void;
}

export function ChatMessage({ message, onRegenerate, followUps, onAsk, onReserve }: ChatMessageProps) {
  const { t, locale } = useI18n();
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const time = new Date(message.created_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボードが使えない環境では何もしない
    }
  };

  if (isUser) {
    return (
      <div className="flex animate-rise flex-col items-end gap-1">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl rounded-br-md bg-roast px-4 py-3 text-[15px] leading-relaxed text-on-roast md:max-w-[70%]">
          {message.content}
        </div>
        <span className="px-2 text-[11px] text-muted">{time}</span>
      </div>
    );
  }

  return (
    <div className="flex animate-rise gap-3">
      <BrandMark size={32} />
      <div className="flex min-w-0 max-w-full flex-1 flex-col gap-1.5 md:max-w-[85%]">
        <div className="rounded-3xl rounded-tl-md border border-line bg-surface px-5 py-4 text-ink shadow-soft">
          <Markdown content={message.content} />
        </div>

        <div className="flex flex-wrap items-center gap-1 px-1 text-[11px] text-muted">
          <span className="mr-1">{time}</span>
          <button
            onClick={handleCopy}
            className="inline-flex min-h-[32px] cursor-pointer items-center gap-1 rounded-full px-2.5 transition hover:bg-sunken hover:text-ink"
            aria-label={t("copy")}
          >
            {copied ? <Check size={13} className="text-sage" /> : <Copy size={13} />}
            <span className={copied ? "text-sage" : ""}>{copied ? t("copied") : t("copy")}</span>
          </button>
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              className="inline-flex min-h-[32px] cursor-pointer items-center gap-1 rounded-full px-2.5 transition hover:bg-sunken hover:text-ink"
            >
              <RefreshCw size={13} />
              {t("regenerate")}
            </button>
          )}
        </div>

        {onReserve && (
          <button onClick={onReserve} className="btn-primary mt-1 self-start">
            <CalendarCheck size={16} />
            {t("reserve")}
          </button>
        )}

        {followUps && followUps.length > 0 && onAsk && (
          <div className="mt-2">
            <p className="mb-1.5 px-1 text-[11px] font-medium tracking-wide text-muted">{t("followUps")}</p>
            <div className="flex flex-wrap gap-2">
              {followUps.map((q) => (
                <button
                  key={q}
                  onClick={() => onAsk(q)}
                  className="inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-left text-xs text-ink transition hover:border-caramel/50 hover:bg-caramel-soft"
                >
                  <CornerDownRight size={12} className="shrink-0 text-caramel" aria-hidden="true" />
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
