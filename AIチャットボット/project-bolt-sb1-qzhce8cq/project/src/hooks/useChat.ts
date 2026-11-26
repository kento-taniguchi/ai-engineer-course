import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Conversation, Message, DifyStreamEvent } from "@/types";

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dify-chat`;

export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load all conversations
  const loadConversations = useCallback(async () => {
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      setError("会話履歴の読み込みに失敗しました");
      return;
    }
    setConversations((data as Conversation[]) ?? []);
  }, []);

  // Load messages for a conversation
  const loadMessages = useCallback(async (conversationId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      setError("メッセージの読み込みに失敗しました");
      return;
    }
    setMessages((data as Message[]) ?? []);
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const selectConversation = useCallback(
    (conversationId: string | null) => {
      setActiveConversationId(conversationId);
      setError(null);
      if (conversationId) {
        loadMessages(conversationId);
      } else {
        setMessages([]);
      }
    },
    [loadMessages],
  );

  const createConversation = useCallback(async (): Promise<Conversation | null> => {
    const { data, error } = await supabase
      .from("conversations")
      .insert({ title: "新しいチャット" })
      .select()
      .single();

    if (error || !data) {
      setError("会話の作成に失敗しました");
      return null;
    }
    const conv = data as Conversation;
    setConversations((prev) => [conv, ...prev]);
    return conv;
  }, []);

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      const { error } = await supabase.from("conversations").delete().eq("id", conversationId);
      if (error) {
        setError("会話の削除に失敗しました");
        return;
      }
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (activeConversationId === conversationId) {
        selectConversation(null);
      }
    },
    [activeConversationId, selectConversation],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;
      setError(null);
      setStreamingContent("");

      // Ensure we have a conversation
      let convId = activeConversationId;
      let conv = conversations.find((c) => c.id === convId) ?? null;
      if (!convId || !conv) {
        conv = await createConversation();
        if (!conv) return;
        convId = conv.id;
        setActiveConversationId(convId);
      }

      // Insert user message into DB and UI
      const userMsg: Message = {
        id: crypto.randomUUID(),
        conversation_id: convId,
        role: "user",
        content: text,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      const { error: insertErr } = await supabase.from("messages").insert({
        id: userMsg.id,
        conversation_id: convId,
        role: "user",
        content: text,
      });
      if (insertErr) {
        setError("メッセージの保存に失敗しました");
        return;
      }

      // Auto-title the conversation from the first user message
      const isFirstMessage = messages.length === 0;
      if (isFirstMessage) {
        const title = text.length > 40 ? text.slice(0, 40) + "…" : text;
        await supabase.from("conversations").update({ title, updated_at: new Date().toISOString() }).eq("id", convId);
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, title } : c)),
        );
      }

      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      // ここまでに届いた回答の全文（停止したときの保存にも使う）
      let fullAnswer = "";

      const saveAssistantMessage = async (content: string) => {
        const assistantId = crypto.randomUUID();
        const { error: asstErr } = await supabase.from("messages").insert({
          id: assistantId,
          conversation_id: convId,
          role: "assistant",
          content,
        });
        if (asstErr) {
          setError("回答の保存に失敗しました");
          return;
        }
        setMessages((prev) => [
          ...prev,
          {
            id: assistantId,
            conversation_id: convId!,
            role: "assistant",
            content,
            created_at: new Date().toISOString(),
          },
        ]);
      };

      try {
        const res = await fetch(EDGE_FUNCTION_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            query: text,
            conversation_id: conv?.dify_conversation_id ?? "",
            user: convId,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error ?? `リクエストエラー (${res.status})`);
        }

        if (!res.body) throw new Error("ストリームレスポンスがありません");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let difyConversationId = conv?.dify_conversation_id ?? "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const chunk of lines) {
            const line = chunk.trim();
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            let evt: DifyStreamEvent;
            try {
              evt = JSON.parse(jsonStr);
            } catch {
              continue; // 読めない行は飛ばす
            }

            // Difyの会話ID（会話の続きを覚えておくための番号）は、
            // 回答のかけら1つ1つにも入っているので、届いたら控えておく
            if (evt.conversation_id) {
              difyConversationId = evt.conversation_id;
            }

            if (evt.event === "message" && evt.answer) {
              // Difyは回答を少しずつ（差分で）送ってくるので、つなげていく
              fullAnswer += evt.answer;
              setStreamingContent(fullAnswer);
            } else if (evt.event === "message_replace" && evt.answer !== undefined) {
              // 内容の差し替え（モデレーションなど）は全文で届く
              fullAnswer = evt.answer;
              setStreamingContent(fullAnswer);
            } else if (evt.event === "error") {
              throw new Error(
                `Difyでエラーが発生しました${evt.message ? `：${evt.message}` : ""}`,
              );
            }
          }
        }

        // Save assistant message
        if (fullAnswer) {
          await saveAssistantMessage(fullAnswer);
        }

        // Update dify_conversation_id if we got one
        if (difyConversationId && conv?.dify_conversation_id !== difyConversationId) {
          await supabase
            .from("conversations")
            .update({ dify_conversation_id: difyConversationId, updated_at: new Date().toISOString() })
            .eq("id", convId);
          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId ? { ...c, dify_conversation_id: difyConversationId, updated_at: new Date().toISOString() } : c,
            ),
          );
        }

        // Bump updated_at
        await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
        setConversations((prev) => {
          const updated = prev.map((c) =>
            c.id === convId ? { ...c, updated_at: new Date().toISOString() } : c,
          );
          return updated.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // 停止ボタンが押された：途中までの回答があれば1回だけ保存する
          if (fullAnswer) {
            await saveAssistantMessage(fullAnswer);
          }
        } else {
          const msg = err instanceof Error ? err.message : "不明なエラーが発生しました";
          setError(msg);
        }
      } finally {
        setStreamingContent("");
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [activeConversationId, conversations, createConversation, isStreaming, messages.length],
  );

  const newChat = useCallback(() => {
    stopStreaming();
    selectConversation(null);
  }, [selectConversation, stopStreaming]);

  const clearError = useCallback(() => setError(null), []);

  return {
    clearError,
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
  };
}
