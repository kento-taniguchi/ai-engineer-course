const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ChatRequestBody {
  query: string;
  conversation_id?: string;
  inputs?: Record<string, unknown>;
  user?: string;
  files?: Array<Record<string, unknown>>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const DIFY_API_URL = Deno.env.get("DIFY_API_URL");
    const DIFY_API_KEY = Deno.env.get("DIFY_API_KEY");

    if (!DIFY_API_URL || !DIFY_API_KEY) {
      return new Response(
        JSON.stringify({
          error:
            "Dify API configuration is missing. Please set DIFY_API_URL and DIFY_API_KEY in edge function secrets.",
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const body = (await req.json()) as ChatRequestBody;

    if (!body.query || typeof body.query !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing required field: query" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const useStreaming = req.headers
      .get("Accept")
      ?.includes("text/event-stream");

    const difyPayload = {
      inputs: body.inputs ?? {},
      query: body.query,
      response_mode: useStreaming ? "streaming" : "blocking",
      conversation_id: body.conversation_id ?? "",
      user: body.user ?? "web-user",
      files: body.files ?? [],
    };

    const difyRes = await fetch(`${DIFY_API_URL}/chat-messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DIFY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(difyPayload),
    });

    if (!difyRes.ok) {
      const errText = await difyRes.text();
      return new Response(
        JSON.stringify({
          error: `Dify API error (${difyRes.status})`,
          detail: errText,
        }),
        {
          status: difyRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (useStreaming && difyRes.body) {
      // Stream the SSE response back to the client, filtering to only
      // message/message_replace/end events to keep things clean.
      const { readable, writable } = new TransformStream({
        transform(chunk, controller) {
          controller.enqueue(chunk);
        },
      });

      (async () => {
        const writer = writable.getWriter();
        const reader = difyRes.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const dataStr = line.slice(6).trim();
                if (dataStr === "") continue;
                try {
                  const evt = JSON.parse(dataStr);
                  // Pass through message, message_replace, message_end, and error events
                  if (
                    evt.event === "message" ||
                    evt.event === "message_replace" ||
                    evt.event === "error" ||
                    evt.event === "message_end"
                  ) {
                    const out =
                      `data: ${JSON.stringify(evt)}\n\n`;
                    await writer.write(new TextEncoder().encode(out));
                  }
                } catch {
                  // skip non-JSON lines
                }
              }
            }
          }
        } finally {
          await writer.close();
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
    }

    // Blocking mode: return the full JSON response
    const data = await difyRes.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message ?? "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
