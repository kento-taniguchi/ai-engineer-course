import { Bot, Sparkles } from "lucide-react";

interface EmptyStateProps {
  onSuggestionClick: (text: string) => void;
}

const suggestions = [
  "こんにちは！何ができますか？",
  "このアプリの使い方を教えてください",
  "面白い話題を提案してください",
];

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-lg shadow-indigo-500/30">
        <Bot size={32} className="text-white" />
      </div>
      <h1 className="text-2xl font-bold text-slate-800">AIチャットボット</h1>
      <p className="mt-2 text-center text-sm text-slate-500">
        お気軽にメッセージを送ってください。<br />何でもお手伝いします。
      </p>

      <div className="mt-8 w-full max-w-md space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
          <Sparkles size={14} />
          おすすめの質問
        </p>
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSuggestionClick(s)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 transition-all hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 active:scale-[0.98]"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
