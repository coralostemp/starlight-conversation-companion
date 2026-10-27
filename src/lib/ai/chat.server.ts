import { createOpenAI } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

import type { Database, Json } from "@/integrations/supabase/types";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./run-id.server";

const MODEL = "openai/gpt-6-astra";
const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const INSTRUCTIONS =
  "You are Open Finder, a helpful, friendly and precise AI assistant. Answer clearly using Markdown when useful. When the user attaches images or PDFs, read them carefully and refer to them in your answer.";

const json = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json" } });

function userClient(token: string) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("apikey", key);
        headers.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export async function handleChat(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return json(401, "Please sign in again.");
  const supabase = userClient(token);
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData.user) return json(401, "Please sign in again.");
  const userId = userData.user.id;

  let body: { id?: string; messages?: UIMessage[] };
  try {
    body = await request.json();
  } catch {
    return json(400, "Invalid request.");
  }
  const chatId = body.id;
  const messages = body.messages;
  if (!chatId || !Array.isArray(messages) || messages.length === 0) return json(400, "Invalid request.");

  const { data: chat, error: chatErr } = await supabase
    .from("chats")
    .select("id,title")
    .eq("id", chatId)
    .maybeSingle();
  if (chatErr || !chat) return json(404, "Chat not found.");

  const last = messages[messages.length - 1];
  if (last.role === "user") {
    const { error } = await supabase.from("messages").upsert(
      { chat_id: chatId, user_id: userId, ui_id: last.id, role: "user", parts: last.parts as unknown as Json },
      { onConflict: "chat_id,ui_id" },
    );
    if (error) {
      console.error("save user message", error);
      return json(500, "Could not save your message.");
    }
    if (chat.title === "New chat") {
      const text = last.parts
        .map((p) => (p.type === "text" ? p.text : ""))
        .join(" ")
        .trim();
      const fileName = last.parts.find((p) => p.type === "file") as { filename?: string } | undefined;
      const title = (text || fileName?.filename || "New chat").replace(/\s+/g, " ").slice(0, 60);
      await supabase.from("chats").update({ title }).eq("id", chatId);
    }
  }

  // Resolve stored attachments into inline data for the model.
  const resolved: UIMessage[] = await Promise.all(
    messages.map(async (m) => ({
      ...m,
      parts: await Promise.all(
        m.parts.map(async (p) => {
          if (p.type === "file" && p.url.startsWith("storage:")) {
            const path = p.url.slice("storage:".length);
            const { data, error } = await supabase.storage.from("attachments").download(path);
            if (error || !data) return { type: "text" as const, text: `[Attachment ${p.filename ?? ""} unavailable]` };
            return { ...p, url: `data:${p.mediaType};base64,${toBase64(await data.arrayBuffer())}` };
          }
          return p;
        }),
      ),
    })),
  );

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return json(500, "AI is not configured.");

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const result = streamText({
    model: provider.responses(MODEL),
    system: INSTRUCTIONS,
    messages: await convertToModelMessages(resolved),
    abortSignal: request.signal,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "medium",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  const response = result.toUIMessageStreamResponse({
    originalMessages: messages,
    sendReasoning: true,
    generateMessageId: () => crypto.randomUUID(),
    onError: (error) => {
      console.error("chat stream error", error);
      const e = error as { statusCode?: number; message?: string };
      if (e?.statusCode === 429) return "Too many requests right now. Please wait a moment and try again.";
      if (e?.statusCode === 402) return "AI credits have run out. Add credits to keep chatting.";
      return e?.message || "Something went wrong while answering.";
    },
    onFinish: async ({ responseMessage }) => {
      if (!responseMessage?.parts?.length) return;
      const { error } = await supabase.from("messages").upsert(
        {
          chat_id: chatId,
          user_id: userId,
          ui_id: responseMessage.id,
          role: "assistant",
          parts: responseMessage.parts as unknown as Json,
        },
        { onConflict: "chat_id,ui_id" },
      );
      if (error) console.error("save assistant message", error);
      await supabase.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);
    },
  });

  return withLovableAiGatewayRunIdHeader(response, runIdFetch);
}
