import { useEffect, useRef, useState } from "react";
import { AlertCircle, Menu, X } from "lucide-react";
import { useChat } from "@/hooks/useChat";
import { Sidebar } from "@/components/Sidebar";
import { ChatMessage } from "@/components/ChatMessage";
import { StreamingMessage } from "@/components/StreamingMessage";
import { ChatInput } from "@/components/ChatInput";
import { EmptyState } from "@/components/EmptyState";

function App() {
  const {
    conversations,
    activeConversationId,
    messages,
    isStreaming,
    streamingContent,
    error,
    sendMessage,
    stopStreaming,
    selectConversation,
    deleteConversation,
    newChat,
    clearError,
  } = useChat();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const hasMessages = messages.length > 0 || isStreaming;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelect={(id) => {
          selectConversation(id);
          setSidebarOpen(false);
        }}
        onDelete={deleteConversation}
        onNewChat={() => {
          newChat();
          setSidebarOpen(false);
        }}
      />

      <main className="flex flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label="メニュー"
          >
            <Menu size={20} />
          </button>
          <h1 className="flex-1 text-center text-sm font-semibold text-slate-700 md:text-left md:pl-2">
            AIチャットボット
          </h1>
          <div className="w-9 md:w-0" />
        </header>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            <AlertCircle size={16} className="shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              onClick={clearError}
              className="rounded p-0.5 hover:bg-red-100"
              aria-label="閉じる"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto"
        >
          {!hasMessages ? (
            <EmptyState onSuggestionClick={sendMessage} />
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}
              {isStreaming && streamingContent && (
                <StreamingMessage content={streamingContent} />
              )}
              {isStreaming && !streamingContent && (
                <div className="flex flex-row gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-white [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-white [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-white" />
                    </div>
                  </div>
                  <div className="flex items-center rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
                    <span className="text-sm text-slate-400">考え中...</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <ChatInput onSend={sendMessage} onStop={stopStreaming} isStreaming={isStreaming} />
      </main>
    </div>
  );
}

export default App;
