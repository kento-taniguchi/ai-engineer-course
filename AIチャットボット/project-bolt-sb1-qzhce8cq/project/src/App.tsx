import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AlertCircle, CalendarCheck, Download, Menu, RefreshCw, X } from "lucide-react";
import { useAuth, type AuthApi } from "@/hooks/useAuth";
import { useChat } from "@/hooks/useChat";
import { useShop } from "@/hooks/useShop";
import { useI18n } from "@/lib/i18n";
import { Sidebar } from "@/components/Sidebar";
import { ChatMessage } from "@/components/ChatMessage";
import { StreamingMessage } from "@/components/StreamingMessage";
import { ChatInput } from "@/components/ChatInput";
import { EmptyState } from "@/components/EmptyState";
import { LoginScreen } from "@/components/LoginScreen";
import { AccountMenu, PreferenceSwitchers } from "@/components/SettingsMenu";
import { CrowdBadge } from "@/components/CrowdBadge";
import { ReservationDialog } from "@/components/ReservationDialog";
import { BrandMark } from "@/components/BrandMark";
import { downloadConversation } from "@/lib/exportConversation";
import type { Product } from "@/types";

// 店主メニューは開いたときだけ読み込む（お客さんの画面を軽くするため）
const AdminApp = lazy(() => import("@/admin/AdminApp").then((m) => ({ default: m.AdminApp })));

/** 予約の話題かどうか（日本語・英語・中国語・韓国語） */
const RESERVE_WORDS = /予約|取り置き|reserv|book a table|预约|預約|预订|예약/i;

const useHashRoute = () => {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
};

function App() {
  const auth = useAuth();
  const shop = useShop();
  const hash = useHashRoute();

  if (auth.loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-canvas">
        <BrandMark size={48} steam />
      </div>
    );
  }
  if (!auth.session) return <LoginScreen auth={auth} status={shop.status} />;
  if (hash === "#/admin") {
    return (
      <Suspense
        fallback={
          <div className="flex h-dvh items-center justify-center bg-canvas">
            <BrandMark size={48} steam />
          </div>
        }
      >
        <AdminApp auth={auth} onBack={() => (window.location.hash = "")} />
      </Suspense>
    );
  }
  return <ChatApp auth={auth} shop={shop} />;
}

function ChatApp({ auth, shop }: { auth: AuthApi; shop: ReturnType<typeof useShop> }) {
  const { lang, t } = useI18n();
  const chat = useChat(auth.user?.id ?? null, lang, t);
  const {
    conversations,
    activeConversationId,
    messages,
    isStreaming,
    streamingContent,
    error,
    quota,
    followUps,
    sendMessage,
    stopStreaming,
    selectConversation,
    deleteConversation,
    renameConversation,
    regenerate,
    newChat,
    clearError,
  } = chat;

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [preselect, setPreselect] = useState<Product | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streamingContent, followUps]);

  const openReserve = (product: Product | null = null) => {
    setPreselect(product);
    setReserveOpen(true);
  };

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const hasMessages = messages.length > 0 || isStreaming;
  const lastMessage = messages[messages.length - 1];
  const lastUserText = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const needsRetry = !isStreaming && lastMessage?.role === "user";

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        isOpen={sidebarOpen}
        status={shop.status}
        onClose={() => setSidebarOpen(false)}
        onSelect={(id) => {
          selectConversation(id);
          setSidebarOpen(false);
        }}
        onDelete={deleteConversation}
        onRename={renameConversation}
        onNewChat={() => {
          newChat();
          setSidebarOpen(false);
        }}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-line/70 bg-canvas/80 px-3 py-2 backdrop-blur sm:px-5">
          <button onClick={() => setSidebarOpen(true)} className="icon-btn md:hidden" aria-label={t("menu")}>
            <Menu size={20} />
          </button>
          <div className="min-w-0 flex-1">
            {activeConversation && messages.length > 0 ? (
              <h1 className="truncate font-serif text-[15px] font-bold text-ink">{activeConversation.title}</h1>
            ) : (
              <CrowdBadge status={shop.status} />
            )}
          </div>
          {activeConversation && messages.length > 0 && (
            <div className="hidden lg:block">
              <CrowdBadge status={shop.status} />
            </div>
          )}
          <button onClick={() => openReserve()} className="btn-ghost hidden min-h-[40px] sm:inline-flex">
            <CalendarCheck size={16} />
            {t("reserve")}
          </button>
          {activeConversation && messages.length > 0 && (
            <button
              onClick={() => downloadConversation(activeConversation.title, messages, t("appName"), t("you"))}
              disabled={isStreaming}
              className="icon-btn"
              aria-label={t("exportChat")}
              title={t("exportChat")}
            >
              <Download size={18} />
            </button>
          )}
          <div className="hidden sm:block">
            <PreferenceSwitchers />
          </div>
          <AccountMenu
            email={auth.user?.email ?? null}
            isGuest={auth.isGuest}
            isStaff={auth.isStaff}
            onOpenAdmin={() => (window.location.hash = "#/admin")}
            onSignOut={auth.signOut}
          />
        </header>

        {error && (
          <div className="flex items-center gap-2 border-b border-berry/20 bg-berry/10 px-4 py-2.5 text-sm text-berry" role="alert">
            <AlertCircle size={16} className="shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={clearError} className="icon-btn h-8 w-8 text-berry" aria-label={t("close")}>
              <X size={16} />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {!hasMessages ? (
            <EmptyState onSuggestionClick={sendMessage} status={shop.status} picks={shop.picks} onReserve={openReserve} />
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-7 px-4 py-8 sm:px-6">
              {messages.map((msg) => {
                const isLast = msg.id === lastMessage?.id && !isStreaming;
                return (
                  <ChatMessage
                    key={msg.id}
                    message={msg}
                    onRegenerate={isLast ? regenerate : undefined}
                    followUps={isLast && followUps?.messageId === msg.id ? followUps.questions : undefined}
                    onAsk={sendMessage}
                    onReserve={isLast && RESERVE_WORDS.test(lastUserText) ? () => openReserve() : undefined}
                  />
                );
              })}
              {isStreaming && <StreamingMessage content={streamingContent} />}
              {needsRetry && (
                <div className="flex justify-center">
                  <button onClick={regenerate} className="btn-ghost text-xs">
                    <RefreshCw size={14} />
                    {t("retry")}
                  </button>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <ChatInput
          onSend={sendMessage}
          onStop={stopStreaming}
          onReserve={() => openReserve()}
          isStreaming={isStreaming}
          quota={quota}
        />
      </main>

      <ReservationDialog
        open={reserveOpen}
        onClose={() => setReserveOpen(false)}
        status={shop.status}
        preselect={preselect}
        onBooked={shop.refresh}
      />
    </div>
  );
}

export default App;
