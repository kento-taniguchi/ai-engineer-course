import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import type { Conversation, Message, DifyStreamEvent } from "@/types";
import type { DictKey, Lang } from "@/lib/i18n";

const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/cafe-chat`;

const sortByUpdated = (list: Conversation[]) =>
  [...list].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

type T = (key: DictKey, vars?: Record<string, string | number>) => string;

interface HistoryItem {
  role: "user" | "assistant";
  content: string;
}

/** 中継役（Edge Function）を呼ぶ。ログイン中の合言葉（アクセストークン）を付ける */
async function callEdge(body: unknown, signal?: AbortSignal, stream = false) {
  const { data } = await supabase.auth.getSession();
  return fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
      apikey: SUPABASE_ANON_KEY,
      ...(stream ? { Accept: "text/event-stream" } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
}

export function useChat(userId: string | null, lang: Lang, t: T) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<{ remaining: number | null; limit: number | null } | null>(null);
  // 次の質問の候補（最後の回答のぶんだけ）
  const [followUps, setFollowUps] = useState<{ messageId: string; questions: string[] } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const tRef = useRef(t);
  tRef.current = t;

  // ---- 読み込み ----
  const loadConversations = useCallback(async () => {
    if (!userId) {
      setConversations([]);
      return;
    }
    const { data, error } = await supabase
      .from("cafe_conversations")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) {
      setError(tRef.current("err_generic"));
      return;
    }
    setConversations((data as Conversation[]) ?? []);
  }, [userId]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const { data, error } = await supabase
      .from("cafe_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) {
      setError(tRef.current("err_generic"));
      return;
    }
    setMessages((data as Message[]) ?? []);
  }, []);

  const loadQuota = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.rpc("cafe_quota_status");
    if (data) setQuota(data as { remaining: number | null; limit: number | null });
  }, [userId]);

  useEffect(() => {
    // ログインした人が変わったら、表示をまっさらにして読み直す
    setActiveConversationId(null);
    setMessages([]);
    setFollowUps(null);
    loadConversations();
    loadQuota();
  }, [loadConversations, loadQuota]);

  const selectConversation = useCallback(
    (conversationId: string | null) => {
      setActiveConversationId(conversationId);
      setError(null);
      setFollowUps(null);
      if (conversationId) loadMessages(conversationId);
      else setMessages([]);
    },
    [loadMessages],
  );

  // ---- 会話の作成・削除・名前変更 ----
  const createConversation = useCallback(async (): Promise<Conversation | null> => {
    const { data, error } = await supabase
      .from("cafe_conversations")
      .insert({ title: "新しいチャット" })
      .select()
      .single();
    if (error || !data) {
      setError(tRef.current("err_generic"));
      return null;
    }
    const conv = data as Conversation;
    setConversations((prev) => [conv, ...prev]);
    return conv;
  }, []);

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      const { error } = await supabase.from("cafe_conversations").delete().eq("id", conversationId);
      if (error) {
        setError(tRef.current("err_generic"));
        return;
      }
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (activeConversationId === conversationId) selectConversation(null);
    },
    [activeConversationId, selectConversation],
  );

  const renameConversation = useCallback(async (conversationId: string, title: string) => {
    const newTitle = title.trim().slice(0, 80);
    if (!newTitle) return;
    const { error } = await supabase.from("cafe_conversations").update({ title: newTitle }).eq("id", conversationId);
    if (error) {
      setError(tRef.current("err_generic"));
      return;
    }
    setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, title: newTitle } : c)));
  }, []);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  // ---- 次の質問の候補 ----
  const loadFollowUps = useCallback(async (msg: Message) => {
    if (!msg.dify_message_id) return;
    try {
      const res = await callEdge({ action: "suggested", message_id: msg.dify_message_id });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.questions) && data.questions.length > 0) {
        setFollowUps({ messageId: msg.id, questions: data.questions });
      }
    } catch {
      // 候補が取れなくても、チャット自体には影響させない
    }
  }, []);

  // 過去の会話を開いたときも、最後の回答に候補を出す
  useEffect(() => {
    if (isStreaming) return;
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && last.dify_message_id && followUps?.messageId !== last.id) {
      loadFollowUps(last);
    }
  }, [messages, isStreaming, followUps?.messageId, loadFollowUps]);

  /**
   * Difyに質問を送り、回答をストリーミングで受け取って保存する。
   * history を渡したとき（再生成）は、Dify側で新しい会話として始める。
   */
  const streamAnswer = useCallback(
    async (convId: string, difyConversationIdBefore: string, text: string, history: HistoryItem[] = []) => {
      setStreamingContent("");
      setIsStreaming(true);
      setFollowUps(null);

      const controller = new AbortController();
      abortRef.current = controller;

      let fullAnswer = "";
      let difyConversationId = difyConversationIdBefore;
      let difyMessageId: string | null = null;

      const saveAssistantMessage = async (content: string) => {
        const msg: Message = {
          id: crypto.randomUUID(),
          conversation_id: convId,
          role: "assistant",
          content,
          dify_message_id: difyMessageId,
          created_at: new Date().toISOString(),
        };
        const { error: asstErr } = await supabase.from("cafe_messages").insert({
          id: msg.id,
          conversation_id: convId,
          role: "assistant",
          content,
          dify_message_id: difyMessageId,
        });
        if (asstErr) {
          setError(tRef.current("err_generic"));
          return;
        }
        setMessages((prev) => [...prev, msg]);
      };

      try {
        const res = await callEdge(
          { query: text, conversation_id: difyConversationIdBefore, lang, history },
          controller.signal,
          true,
        );

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          if (res.status === 429) {
            setQuota({ remaining: 0, limit: errBody.limit ?? null });
            throw new Error(
              errBody.code === "total"
                ? tRef.current("quotaOutTotal")
                : tRef.current("quotaOutUser", { n: errBody.limit ?? "" }),
            );
          }
          if (res.status === 401) throw new Error(tRef.current("loginRequired"));
          throw new Error(errBody.error ?? `${tRef.current("err_generic")} (${res.status})`);
        }
        if (!res.body) throw new Error(tRef.current("err_generic"));

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";

          for (const chunk of chunks) {
            const line = chunk.trim();
            if (!line.startsWith("data: ")) continue;
            let evt: DifyStreamEvent;
            try {
              evt = JSON.parse(line.slice(6));
            } catch {
              continue;
            }
            if (evt.event === "quota") {
              setQuota({ remaining: evt.remaining ?? null, limit: evt.limit ?? null });
              continue;
            }
            if (evt.conversation_id) difyConversationId = evt.conversation_id;
            if (evt.message_id) difyMessageId = evt.message_id;

            if (evt.event === "message" && evt.answer) {
              fullAnswer += evt.answer; // 回答は少しずつ（差分で）届くのでつなげる
              setStreamingContent(fullAnswer);
            } else if (evt.event === "message_replace" && evt.answer !== undefined) {
              fullAnswer = evt.answer;
              setStreamingContent(fullAnswer);
            } else if (evt.event === "error") {
              throw new Error(`${tRef.current("err_generic")}${evt.message ? `（${evt.message}）` : ""}`);
            }
          }
        }

        if (fullAnswer) await saveAssistantMessage(fullAnswer);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          if (fullAnswer) await saveAssistantMessage(fullAnswer);
        } else {
          setError(err instanceof Error ? err.message : tRef.current("err_generic"));
        }
      } finally {
        setStreamingContent("");
        setIsStreaming(false);
        abortRef.current = null;
      }

      // Difyの会話IDの保存（再生成で新しい会話になったときも差し替える）と、一覧の並び替え
      const now = new Date().toISOString();
      const patch: Partial<Conversation> = { updated_at: now };
      if (difyConversationId && difyConversationId !== difyConversationIdBefore) {
        patch.dify_conversation_id = difyConversationId;
      }
      await supabase.from("cafe_conversations").update(patch).eq("id", convId);
      setConversations((prev) => sortByUpdated(prev.map((c) => (c.id === convId ? { ...c, ...patch } : c))));
    },
    [lang],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming || busyRef.current) return;
      busyRef.current = true;
      setError(null);
      try {
        let convId = activeConversationId;
        let conv = conversations.find((c) => c.id === convId) ?? null;
        if (!convId || !conv) {
          conv = await createConversation();
          if (!conv) return;
          convId = conv.id;
          setActiveConversationId(convId);
        }

        const userMsg: Message = {
          id: crypto.randomUUID(),
          conversation_id: convId,
          role: "user",
          content: text,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, userMsg]);
        const { error: insertErr } = await supabase
          .from("cafe_messages")
          .insert({ id: userMsg.id, conversation_id: convId, role: "user", content: text });
        if (insertErr) {
          setError(tRef.current("err_generic"));
          return;
        }

        if (messages.length === 0) {
          const title = text.length > 40 ? text.slice(0, 40) + "…" : text;
          await supabase.from("cafe_conversations").update({ title }).eq("id", convId);
          setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, title } : c)));
        }

        await streamAnswer(convId, conv.dify_conversation_id ?? "", text);
      } finally {
        busyRef.current = false;
      }
    },
    [activeConversationId, conversations, createConversation, isStreaming, messages.length, streamAnswer],
  );

  /**
   * 最後の回答を作り直す。
   * Difyには「1つの回答だけ消す」機能がないので、同じ会話で聞き直すと
   * 同じ質問が2回記憶されて答えがおかしくなる。
   * そこで、Dify側では新しい会話として始め、それまでのやりとりを添えて送る。
   */
  const regenerate = useCallback(async () => {
    if (isStreaming || busyRef.current || !activeConversationId) return;
    const conv = conversations.find((c) => c.id === activeConversationId);
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserIndex = i;
        break;
      }
    }
    if (!conv || lastUserIndex < 0) return;
    const question = messages[lastUserIndex].content;
    const history = messages.slice(0, lastUserIndex).map((m) => ({ role: m.role, content: m.content }));

    busyRef.current = true;
    setError(null);
    try {
      const last = messages[messages.length - 1];
      if (last?.role === "assistant") {
        const { error: delErr } = await supabase.from("cafe_messages").delete().eq("id", last.id);
        if (delErr) {
          setError(tRef.current("err_generic"));
          return;
        }
        setMessages((prev) => prev.filter((m) => m.id !== last.id));
      }
      await streamAnswer(conv.id, "", question, history);
    } finally {
      busyRef.current = false;
    }
  }, [activeConversationId, conversations, isStreaming, messages, streamAnswer]);

  const newChat = useCallback(() => {
    stopStreaming();
    selectConversation(null);
  }, [selectConversation, stopStreaming]);

  const clearError = useCallback(() => setError(null), []);

  return {
    conversations,
    activeConversationId,
    messages,
    isStreaming,
    streamingContent,
    error,
    quota,
    followUps,
    clearError,
    sendMessage,
    stopStreaming,
    selectConversation,
    deleteConversation,
    renameConversation,
    regenerate,
    newChat,
  };
}
