import { useChat } from "@ai-sdk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DefaultChatTransport, type FileUIPart, type UIMessage } from "ai";
import { CopyIcon, FileText } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import logo from "@/assets/logo.png";
import { AppShell } from "@/components/app-shell";
import { Composer } from "@/components/composer";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { supabase } from "@/integrations/supabase/client";
import { fetchMessages, takePending, uploadFiles } from "@/lib/chat-client";

export const Route = createFileRoute("/_authenticated/c/$chatId")({
  head: () => ({
    meta: [
      { title: "Chat — Open Finder" },
      { name: "description", content: "Your conversation with Open Finder." },
      { property: "og:title", content: "Chat — Open Finder" },
      { property: "og:description", content: "Your conversation with Open Finder." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { chatId } = Route.useParams();
  const history = useQuery({ queryKey: ["messages", chatId], queryFn: () => fetchMessages(chatId), staleTime: Infinity });
  return (
    <AppShell>
      {history.isError ? (
        <div className="m-auto text-muted-foreground">This chat could not be loaded.</div>
      ) : history.data ? (
        <ChatWindow key={chatId} chatId={chatId} initial={history.data} />
      ) : (
        <div className="m-auto">
          <Shimmer>Loading chat…</Shimmer>
        </div>
      )}
    </AppShell>
  );
}

function Attachment({ part }: { part: FileUIPart }) {
  const path = part.url.startsWith("storage:") ? part.url.slice(8) : null;
  const signed = useQuery({
    queryKey: ["signed", path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("attachments").createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  const url = path ? signed.data : part.url;
  if (part.mediaType.startsWith("image/")) {
    return url ? (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={part.filename ?? "image"} className="max-h-56 rounded-2xl border object-cover" />
      </a>
    ) : (
      <div className="size-32 animate-pulse rounded-2xl bg-muted" />
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-2xl border bg-card px-3 py-2 text-sm"
    >
      <FileText className="size-4 text-primary" />
      <span className="max-w-48 truncate">{part.filename ?? "Document"}</span>
    </a>
  );
}

function ChatWindow({ chatId, initial }: { chatId: string; initial: UIMessage[] }) {
  const qc = useQueryClient();
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: async (): Promise<Record<string, string>> => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    [],
  );
  const { messages, sendMessage, status, stop } = useChat({
    id: chatId,
    messages: initial,
    transport,
    onError: (e) => {
      let msg = e.message;
      try {
        msg = JSON.parse(e.message).error ?? msg;
      } catch {
        /* plain text */
      }
      toast.error(msg || "Something went wrong");
    },
    onFinish: () => {
      qc.invalidateQueries({ queryKey: ["chats"] });
      qc.invalidateQueries({ queryKey: ["messages", chatId] });
    },
  });

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const draft = takePending(chatId);
    if (draft) {
      sendMessage({ text: draft.text, files: draft.files });
      setTimeout(() => qc.invalidateQueries({ queryKey: ["chats"] }), 1500);
    }
  }, [chatId, sendMessage, qc]);

  async function submit(m: PromptInputMessage) {
    if (!m.text.trim() && !m.files.length) return;
    if (status === "submitted" || status === "streaming") return;
    try {
      const files = await uploadFiles(m.files);
      sendMessage({ text: m.text, files });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
      throw e;
    }
  }

  const busy = status === "submitted" || status === "streaming";
  const lastIsUser = messages.at(-1)?.role === "user";

  return (
    <>
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-8">
          {messages.map((m) => {
            const files = m.parts.filter((p): p is FileUIPart => p.type === "file");
            const text = m.parts
              .map((p) => (p.type === "text" ? p.text : ""))
              .join("");
            if (m.role === "user") {
              return (
                <Message key={m.id} from="user">
                  {files.length > 0 && (
                    <div className="flex flex-wrap justify-end gap-2">
                      {files.map((f, i) => (
                        <Attachment key={i} part={f} />
                      ))}
                    </div>
                  )}
                  {text && (
                    <MessageContent className="rounded-3xl bg-bubble px-5 py-3 text-bubble-foreground group-[.is-user]:bg-bubble group-[.is-user]:text-bubble-foreground">
                      <p className="whitespace-pre-wrap">{text}</p>
                    </MessageContent>
                  )}
                </Message>
              );
            }
            return (
              <div key={m.id} className="flex gap-4">
                <img src={logo} alt="" width={28} height={28} className="mt-1 size-7 shrink-0" />
                <div className="min-w-0 flex-1">
                  <Message from="assistant">
                    <MessageContent className="bg-transparent p-0">
                      {m.parts.map((p, i) =>
                        p.type === "text" ? <MessageResponse key={i}>{p.text}</MessageResponse> : null,
                      )}
                      {!text && busy && m.id === messages.at(-1)?.id && <Shimmer>Thinking…</Shimmer>}
                    </MessageContent>
                  </Message>
                  {text && !(busy && m.id === messages.at(-1)?.id) && (
                    <MessageActions className="mt-1">
                      <MessageAction
                        tooltip="Copy"
                        label="Copy"
                        onClick={() => {
                          navigator.clipboard.writeText(text);
                          toast.success("Copied");
                        }}
                      >
                        <CopyIcon className="size-4" />
                      </MessageAction>
                    </MessageActions>
                  )}
                </div>
              </div>
            );
          })}
          {busy && lastIsUser && (
            <div className="flex gap-4">
              <img src={logo} alt="" width={28} height={28} className="size-7 shrink-0 animate-pulse" />
              <Shimmer>Thinking…</Shimmer>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        <Composer onSubmit={submit} status={status} onStop={stop} />
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Open Finder can make mistakes, so double-check important answers.
        </p>
      </div>
    </>
  );
}
