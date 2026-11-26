import { MessageCircle, Plus, Trash2, X } from "lucide-react";
import type { Conversation } from "@/types";

interface SidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNewChat: () => void;
}

export function Sidebar({
  conversations,
  activeConversationId,
  isOpen,
  onClose,
  onSelect,
  onDelete,
  onNewChat,
}: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed md:relative z-40 flex h-full w-72 flex-col bg-slate-900 transition-transform duration-300
          ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-sm font-semibold tracking-wide text-slate-300 uppercase">
            チャット履歴
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white md:hidden"
            aria-label="サイドバーを閉じる"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-3 pt-3">
          <button
            onClick={onNewChat}
            className="flex w-full items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 active:scale-[0.98]"
          >
            <Plus size={18} />
            新規チャット
          </button>
        </div>

        <nav className="mt-3 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {conversations.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-slate-500">
              まだチャットがありません
            </p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`
                  group flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors
                  ${
                    activeConversationId === conv.id
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                  }
                `}
                onClick={() => onSelect(conv.id)}
              >
                <MessageCircle size={16} className="shrink-0 opacity-60" />
                <span className="flex-1 truncate">{conv.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conv.id);
                  }}
                  className="shrink-0 rounded p-1 text-slate-500 opacity-0 transition-opacity hover:bg-slate-700 hover:text-red-400 group-hover:opacity-100"
                  aria-label="削除"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </nav>

        <div className="border-t border-slate-800 px-4 py-3">
          <p className="text-xs text-slate-500">
            Powered by Dify AI
          </p>
        </div>
      </aside>
    </>
  );
}
