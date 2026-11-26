import { useEffect, useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";

interface ChatInputProps {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}

export function ChatInput({ onSend, onStop, isStreaming }: ChatInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const handleSend = () => {
    if (!text.trim() || isStreaming) return;
    onSend(text.trim());
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-slate-200 bg-white px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="メッセージを入力してください..."
            className="w-full resize-none rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 pr-12 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white"
          />
        </div>
        {isStreaming ? (
          <button
            onClick={onStop}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700 transition-colors hover:bg-slate-300 active:scale-95"
            aria-label="停止"
          >
            <Square size={18} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition-all hover:bg-indigo-500 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300"
            aria-label="送信"
          >
            <ArrowUp size={20} />
          </button>
        )}
      </div>
      <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-slate-400">
        Enter で送信 / Shift+Enter で改行
      </p>
    </div>
  );
}
