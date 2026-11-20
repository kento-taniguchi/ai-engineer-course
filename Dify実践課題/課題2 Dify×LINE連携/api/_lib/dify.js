// =============================================================
// Dify とやりとりする係
//   - ユーザーの質問をDifyのチャットボットに渡し、回答を受け取る
//   - 「前回までの会話」を引き継ぐ（会話の記憶）
// =============================================================

function baseUrl() {
  // DifyクラウドならこのままでOK。自分でDifyを立てた場合は環境変数で変更します。
  return (process.env.DIFY_API_BASE || "https://api.dify.ai/v1").replace(/\/$/, "");
}

function headers(apiKey) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

/**
 * このユーザーの「いちばん最近の会話ID」をDifyに問い合わせる
 *
 * Difyは会話ごとにID（conversation_id）を発行し、IDを渡せば続きの会話になります。
 * 本来はIDをデータベースに保存しますが、Difyは「ユーザーごとの会話一覧」を
 * 返してくれるので、毎回それを聞けばデータベースなしで会話を引き継げます。
 */
export async function findLatestConversationId(user, apiKey) {
  const url = `${baseUrl()}/conversations?user=${encodeURIComponent(user)}&limit=1`;
  const res = await fetch(url, { headers: headers(apiKey) });
  if (!res.ok) {
    // 取れなくても致命的ではない（新しい会話として始めるだけ）
    console.warn(`会話一覧の取得に失敗 (${res.status})。新しい会話として扱います`);
    return "";
  }
  const json = await res.json();
  return json?.data?.[0]?.id ?? "";
}

/**
 * Difyに質問を送り、回答を受け取る
 * @param {string} query  ユーザーの質問文
 * @param {string} user   ユーザーを区別する名前（LINEのユーザーIDを使う）
 * @param {string} conversationId  続きの会話ならそのID、新しい会話なら ""
 */
export async function askDify({ query, user, conversationId = "", apiKey }) {
  const res = await fetch(`${baseUrl()}/chat-messages`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({
      inputs: {}, // Difyの「開始」ブロックに入力欄を作った場合はここで渡す
      query,
      response_mode: "blocking", // 回答が完成してからまとめて受け取る方式
      conversation_id: conversationId,
      user,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Dify API が失敗しました (${res.status}): ${detail}`);
  }
  const json = await res.json();
  return { answer: json.answer ?? "", conversationId: json.conversation_id ?? "" };
}

/**
 * Difyの回答をLINE向けに整える
 * AIは「**太字**」や「### 見出し」のような記号（マークダウン）を使いがちですが、
 * LINEでは記号がそのまま表示されてしまうので取り除きます。
 */
export function toLineText(answer) {
  return answer
    .replace(/\*\*(.+?)\*\*/g, "$1") // **太字** → 太字
    .replace(/^#{1,6}\s*/gm, "") // ### 見出し → 見出し
    .replace(/^\s*[-*]\s+/gm, "・") // - 箇条書き → ・箇条書き
    .trim();
}
