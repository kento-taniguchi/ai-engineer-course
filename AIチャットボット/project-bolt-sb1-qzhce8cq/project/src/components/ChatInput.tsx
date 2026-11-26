import { useEffect, useRef, useState } from "react";
import { ArrowUp, CalendarCheck, Square } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface ChatInputProps {
  onSend: (text: string) => void;
  onStop: () => void;
  onReserve: () => void;
  isStreaming: boolean;
  quota: { remaining: number | null; limit: number | null } | null;
}

export function ChatInput({ onSend, onStop, onReserve, isStreaming, quota }: ChatInputProps) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const outOfQuota = quota?.remaining === 0;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const handleSend = () => {
    if (!text.trim() || isStreaming || outOfQuota) return;
    onSend(text.trim());
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 日本語入力の変換確定のEnterでは送信しない
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-2 sm:px-4">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-[28px] border border-line bg-surface p-2 shadow-soft transition focus-within:border-caramel/60 focus-within:ring-4 focus-within:ring-caramel/10">
          <button onClick={onReserve} className="icon-btn h-11 w-11" aria-label={t("reserve")} title={t("reserve")}>
            <CalendarCheck size={19} />
          </button>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            maxLength={1000}
            disabled={outOfQuota}
            placeholder={outOfQuota ? t("quotaOutUser", { n: quota?.limit ?? "" }) : t("inputPlaceholder")}
            aria-label={t("inputPlaceholder")}
            className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-1 py-2.5 text-base text-ink outline-none placeholder:text-muted/80 disabled:cursor-not-allowed sm:text-[15px]"
          />
          {isStreaming ? (
            <button
              onClick={onStop}
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-sunken text-ink transition hover:opacity-80 active:scale-95"
              aria-label={t("stop")}
            >
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!text.trim() || outOfQuota}
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-roast text-on-roast transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label={t("send")}
            >
              <ArrowUp size={20} />
            </button>
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between px-3 text-[11px] text-muted">
          <span className="hidden sm:inline">{t("inputHint")}</span>
          {quota?.remaining != null && (
            <span className={`ml-auto tabular-nums ${quota.remaining <= 5 ? "text-caramel" : ""}`}>
              {t("quotaLeft", { n: quota.remaining })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
