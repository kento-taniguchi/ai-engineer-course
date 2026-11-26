// ひだまり珈琲店 AIアシスタントの中継役（Edge Function）
// - ログインしている人だけが使える
// - 1日の利用回数を数え、上限を超えたら止める
// - 在庫・おすすめ・混雑の最新情報をAIにそっと伝える（フードロス対策）
// - 選んだ言語で答えるよう伝える
// - 再生成のときは新しい会話として送り、それまでの流れを添える
// - 次の質問の候補をDifyから取ってくる
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  zh: "简体中文",
  ko: "한국어",
};

const CROWD_JA: Record<string, string> = {
  empty: "空いています",
  normal: "ふつう（席に余裕あり）",
  busy: "混み合っています",
  full: "満席です",
  closed: "営業時間外です",
};

interface HistoryItem {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody {
  action?: "chat" | "suggested";
  query?: string;
  conversation_id?: string;
  lang?: string;
  history?: HistoryItem[];
  message_id?: string;
}

interface Product {
  name: string;
  price: number;
  sale_price: number | null;
  stock: number;
  best_before: string | null;
  promo_text: string;
}

/** AIにそっと伝える店の最新情報をつくる */
async function buildShopContext(supabase: SupabaseClient): Promise<string> {
  const [{ data: recs }, { data: status }] = await Promise.all([
    supabase.rpc("cafe_recommendations"),
    supabase.rpc("cafe_status"),
  ]);

  // それぞれ「どんな質問のときに使うか」を添える（関係ない質問で毎回話題にしないため）
  const lines: string[] = [];
  if (status) {
    const crowd = status.is_open ? CROWD_JA[status.crowd_level] ?? "" : CROWD_JA.closed;
    lines.push(
      `・今の店内：${crowd}${status.crowd_note ? `（店主より：${status.crowd_note}）` : ""}` +
        "（混み具合・今から行けるか を聞かれたときだけ伝える）",
    );
  }
  const products = (recs ?? []) as Product[];
  if (products.length > 0) {
    const list = products
      .map((p) => {
        const onSale = p.sale_price != null && p.sale_price < p.price;
        const price = onSale ? `通常${p.price}円のところ本日${p.sale_price}円` : `${p.price}円`;
        return `${p.name}（${price}${p.promo_text ? `、${p.promo_text}` : ""}）`;
      })
      .join("／");
    lines.push(
      `・早めに召し上がっていただきたい品：${list}` +
        "（おすすめ・食べ物・おやつ・持ち帰りを聞かれたときだけ、質問に合う1品を自然に添える。値段は書かれたとおりに）",
    );
  }
  lines.push("・席の予約と商品の取り置き：この画面の「予約」ボタンで受付（予約の話題のときだけ案内する）");
  return lines.join("\n");
}

/** Difyに送る文章を組み立てる */
// お客様の質問を必ず先頭に置く。前置きが先にあると、AIが前置きを「質問」と取り違え、
// 「お店に関係ない質問」と判断して断ってしまうため。店の情報は後ろに短い補足として付ける。
function composeQuery(text: string, shopContext: string, lang: string, history: HistoryItem[]): string {
  const parts = [text, "", "---", "（ここから下はお店のシステムが自動で付けた補足です。上の質問に答えるときの参考にしてください）"];
  if (history.length > 0) {
    parts.push(
      "これまでの会話：",
      ...history.map((h) => `${h.role === "user" ? "お客様" : "あなた"}：${h.content}`),
    );
  }
  parts.push("お店の今日の情報：", shopContext);
  if (LANGUAGE_NAMES[lang]) {
    parts.push(`回答の言語：必ず${LANGUAGE_NAMES[lang]}で回答してください。`);
  }
  return parts.join("\n");
}

/**
 * Dify側に「shop_info」という入力欄（変数）があるか。5分ごとに確かめ直す。
 * ある → 店の情報はそこから渡し、質問はお客様の言葉そのままで送る（いちばん正確）。
 * ない → 質問の後ろに補足として付ける（Difyを直していなくても動くように）。
 */
let shopInfoCache: { value: boolean; at: number } | null = null;
async function difyHasShopInfo(apiUrl: string, apiKey: string): Promise<boolean> {
  if (shopInfoCache && Date.now() - shopInfoCache.at < 5 * 60 * 1000) return shopInfoCache.value;
  let value = false;
  try {
    const res = await fetch(`${apiUrl}/parameters`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (res.ok) {
      const data = await res.json();
      const form: Record<string, { variable?: string }>[] = Array.isArray(data?.user_input_form)
        ? data.user_input_form
        : [];
      value = form.some((item) => Object.values(item).some((f) => f?.variable === "shop_info"));
    }
  } catch {
    // 確かめられないときは「ない」として扱う
  }
  shopInfoCache = { value, at: Date.now() };
  return value;
}

/** 入力欄に渡す店の情報（会話の流れ・答える言語もここに入れる） */
function composeShopInfo(shopContext: string, lang: string, history: HistoryItem[]): string {
  const parts = ["お店の今日の情報：", shopContext];
  if (history.length > 0) {
    parts.push(
      "",
      "これまでの会話（この続きとして答える）：",
      ...history.map((h) => `${h.role === "user" ? "お客様" : "あなた"}：${h.content}`),
    );
  }
  if (LANGUAGE_NAMES[lang]) parts.push("", `回答の言語：必ず${LANGUAGE_NAMES[lang]}で回答してください。`);
  return parts.join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const DIFY_API_URL = (Deno.env.get("DIFY_API_URL") ?? "").replace(/\/+$/, "");
    const DIFY_API_KEY = Deno.env.get("DIFY_API_KEY");
    if (!DIFY_API_URL || !DIFY_API_KEY) {
      return json({ error: "DifyのAPI設定（DIFY_API_URL / DIFY_API_KEY）がまだ登録されていません。" }, 503);
    }

    // ログインしている人か確かめる
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "ログインが必要です。", code: "login" }, 401);

    const body = (await req.json()) as ChatRequestBody;

    // ---- 次の質問の候補 ----
    if (body.action === "suggested") {
      if (!body.message_id) return json({ questions: [] });
      const res = await fetch(
        `${DIFY_API_URL}/messages/${encodeURIComponent(body.message_id)}/suggested?user=${encodeURIComponent(user.id)}`,
        { headers: { Authorization: `Bearer ${DIFY_API_KEY}` } },
      );
      if (!res.ok) {
        // Dify側で機能がオフのときなど。画面では候補を出さないだけにする
        const detail = await res.json().catch(() => ({}));
        return json({ questions: [], disabled: detail?.code === "app_suggested_questions_after_answer_disabled" });
      }
      const data = await res.json();
      return json({ questions: Array.isArray(data?.data) ? data.data.slice(0, 3) : [] });
    }

    // ---- 質問を送る ----
    const text = (body.query ?? "").trim();
    if (!text) return json({ error: "質問が空です。" }, 400);
    if (text.length > 1000) return json({ error: "質問は1000文字以内でお願いします。" }, 400);

    // 1日の利用回数
    const { data: quota, error: quotaErr } = await supabase.rpc("cafe_consume_quota");
    if (quotaErr) return json({ error: "利用回数の確認に失敗しました。" }, 500);
    if (!quota?.ok) {
      return json({ error: "quota", code: quota?.reason ?? "user", limit: quota?.limit ?? null }, 429);
    }

    const history = (Array.isArray(body.history) ? body.history : [])
      .filter((h) => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
      .slice(-8)
      .map((h) => ({ role: h.role, content: h.content.slice(0, 400) }));

    const lang = body.lang ?? "ja";
    const [shopContext, useInput] = await Promise.all([
      buildShopContext(supabase),
      difyHasShopInfo(DIFY_API_URL, DIFY_API_KEY),
    ]);
    const difyRes = await fetch(`${DIFY_API_URL}/chat-messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${DIFY_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        inputs: useInput ? { shop_info: composeShopInfo(shopContext, lang, history) } : {},
        query: useInput ? text : composeQuery(text, shopContext, lang, history),
        response_mode: "streaming",
        conversation_id: body.conversation_id ?? "",
        user: user.id,
      }),
    });

    if (!difyRes.ok || !difyRes.body) {
      const detail = await difyRes.text();
      return json({ error: `Difyでエラーが発生しました（${difyRes.status}）`, detail }, 502);
    }

    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();

    (async () => {
      const writer = writable.getWriter();
      const reader = difyRes.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        // 最初に残り回数を知らせる
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ event: "quota", remaining: quota.remaining, limit: quota.limit })}\n\n`),
        );
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;
            try {
              const evt = JSON.parse(dataStr);
              if (["message", "message_replace", "message_end", "error"].includes(evt.event)) {
                const out = {
                  event: evt.event,
                  answer: evt.answer,
                  conversation_id: evt.conversation_id,
                  message_id: evt.message_id,
                  message: evt.message,
                  code: evt.code,
                };
                await writer.write(encoder.encode(`data: ${JSON.stringify(out)}\n\n`));
              }
            } catch {
              // JSONでない行は飛ばす
            }
          }
        }
      } catch {
        // お客さんが停止ボタンを押したときなど
      } finally {
        await writer.close().catch(() => {});
      }
    })();

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
  }
});
