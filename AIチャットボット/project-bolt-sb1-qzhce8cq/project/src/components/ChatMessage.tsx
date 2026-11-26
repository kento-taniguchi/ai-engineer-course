import { Bot, User } from "lucide-react";
import type { Message } from "@/types";

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      <div
        className={`
          flex h-9 w-9 shrink-0 items-center justify-center rounded-full
          ${isUser ? "bg-indigo-600" : "bg-slate-700"}
        `}
      >
        {isUser ? (
          <User size={18} className="text-white" />
        ) : (
          <Bot size={18} className="text-white" />
        )}
      </div>

      <div
        className={`
          flex max-w-[75%] flex-col gap-1
          ${isUser ? "items-end" : "items-start"}
        `}
      >
        <div
          className={`
            whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-relaxed
            ${
              isUser
                ? "rounded-tr-sm bg-indigo-600 text-white"
                : "rounded-tl-sm bg-white text-slate-800 shadow-sm ring-1 ring-slate-200"
            }
          `}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}
