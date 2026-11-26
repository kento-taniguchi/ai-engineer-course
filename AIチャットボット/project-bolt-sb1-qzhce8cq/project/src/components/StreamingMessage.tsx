import { Bot } from "lucide-react";

export function StreamingMessage({ content }: { content: string }) {
  return (
    <div className="flex flex-row gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700">
        <Bot size={18} className="text-white" />
      </div>
      <div className="flex max-w-[75%] flex-col gap-1 items-start">
        <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm leading-relaxed text-slate-800 shadow-sm ring-1 ring-slate-200">
          {content}
          <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-slate-400 align-middle" />
        </div>
      </div>
    </div>
  );
}
