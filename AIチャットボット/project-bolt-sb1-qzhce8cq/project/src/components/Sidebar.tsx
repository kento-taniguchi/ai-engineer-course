import { useState } from "react";
import { Check, Clock, MessageCircle, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { Conversation, ShopStatus } from "@/types";
import { useI18n } from "@/lib/i18n";
import { BrandMark } from "@/components/BrandMark";

interface SidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  isOpen: boolean;
  status: ShopStatus | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onNewChat: () => void;
}

export function Sidebar({
  conversations,
  activeConversationId,
  isOpen,
  status,
  onClose,
  onSelect,
  onDelete,
  onRename,
  onNewChat,
}: SidebarProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const keyword = query.trim().toLowerCase();
  const filtered = keyword ? conversations.filter((c) => c.title.toLowerCase().includes(keyword)) : conversations;

  const commitEdit = () => {
    if (editingId && editingTitle.trim()) onRename(editingId, editingTitle);
    setEditingId(null);
  };

  const rowIcon =
    "inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition hover:bg-canvas md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100";

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-30 bg-roast/30 backdrop-blur-sm md:hidden" onClick={onClose} />}

      <aside
        className={`fixed z-40 flex h-full w-[288px] flex-col border-r border-line bg-sunken transition-transform duration-300 md:relative ${
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
        aria-label={t("history")}
      >
        <div className="flex items-center gap-3 px-5 pb-2 pt-5">
          <BrandMark size={34} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-serif text-[15px] font-bold text-ink">{t("appName")}</p>
            <p className="text-[11px] text-muted">{t("assistant")}</p>
          </div>
          <button onClick={onClose} className="icon-btn md:hidden" aria-label={t("close")}>
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2 px-4 pt-3">
          <button onClick={onNewChat} className="btn-primary w-full justify-start rounded-2xl">
            <Plus size={18} />
            {t("newChat")}
          </button>
          <label className="flex min-h-[40px] items-center gap-2 rounded-2xl bg-surface px-3 text-muted ring-1 ring-line focus-within:ring-caramel/60">
            <Search size={14} className="shrink-0" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchChats")}
              aria-label={t("searchChats")}
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted/80"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label={t("close")} className="cursor-pointer hover:text-ink">
                <X size={14} />
              </button>
            )}
          </label>
        </div>

        <p className="px-5 pb-1 pt-5 text-[11px] font-medium tracking-wide text-muted">{t("history")}</p>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {conversations.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-muted">{t("noChats")}</p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-muted">{t("noMatch", { q: query })}</p>
          ) : (
            filtered.map((conv) => {
              const isActive = activeConversationId === conv.id;

              if (editingId === conv.id) {
                return (
                  <div key={conv.id} className="flex items-center gap-1 rounded-2xl bg-surface px-2 py-1.5 ring-1 ring-caramel/50">
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) commitEdit();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      maxLength={80}
                      className="min-w-0 flex-1 bg-transparent px-2 py-1 text-sm text-ink outline-none"
                      aria-label={t("rename")}
                    />
                    <button onClick={commitEdit} className="icon-btn h-8 w-8 text-sage" aria-label={t("save")}>
                      <Check size={14} />
                    </button>
                    <button onClick={() => setEditingId(null)} className="icon-btn h-8 w-8" aria-label={t("cancel")}>
                      <X size={14} />
                    </button>
                  </div>
                );
              }

              if (confirmDeleteId === conv.id) {
                return (
                  <div key={conv.id} className="rounded-2xl bg-berry/10 px-3 py-2.5 text-sm ring-1 ring-berry/30" role="alertdialog">
                    <p className="truncate text-xs text-berry">{t("deleteConfirm", { title: conv.title })}</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => {
                          onDelete(conv.id);
                          setConfirmDeleteId(null);
                        }}
                        className="min-h-[32px] cursor-pointer rounded-full bg-berry px-3 text-xs font-medium text-white dark:text-roast"
                      >
                        {t("delete")}
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)} className="min-h-[32px] cursor-pointer rounded-full px-3 text-xs text-ink hover:bg-surface">
                        {t("cancel")}
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={conv.id}
                  className={`group flex min-h-[44px] cursor-pointer items-center gap-2 rounded-2xl pl-3 pr-1 text-sm transition ${
                    isActive ? "bg-surface text-ink shadow-soft" : "text-muted hover:bg-surface/60 hover:text-ink"
                  }`}
                  onClick={() => onSelect(conv.id)}
                >
                  <MessageCircle size={15} className={`shrink-0 ${isActive ? "text-caramel" : "opacity-60"}`} aria-hidden="true" />
                  <span className="flex-1 truncate" title={conv.title}>
                    {conv.title}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(null);
                      setEditingId(conv.id);
                      setEditingTitle(conv.title);
                    }}
                    className={`${rowIcon} hover:text-caramel`}
                    aria-label={t("rename")}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(null);
                      setConfirmDeleteId(conv.id);
                    }}
                    className={`${rowIcon} hover:text-berry`}
                    aria-label={t("delete")}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })
          )}
        </nav>

        {status && (
          <div className="flex items-center gap-2 border-t border-line px-5 py-4 text-[11px] text-muted">
            <Clock size={13} aria-hidden="true" />
            {t("hours", { open: status.open_time, close: status.close_time })}
          </div>
        )}
      </aside>
    </>
  );
}
