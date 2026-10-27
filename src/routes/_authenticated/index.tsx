import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell, useProfile } from "@/components/app-shell";
import { Composer } from "@/components/composer";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { createChat, setPending, uploadFiles } from "@/lib/chat-client";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Open Finder — ask anything" },
      { name: "description", content: "Start a new chat with Open Finder. Ask questions, attach images or PDFs." },
      { property: "og:title", content: "Open Finder — ask anything" },
      { property: "og:description", content: "Start a new chat with your AI assistant." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

const SUGGESTIONS = [
  "Plan a 3-day trip to Lisbon",
  "Explain quantum computing simply",
  "Write a polite follow-up email",
  "Summarize the PDF I'll attach",
];

function Home() {
  const navigate = useNavigate();
  const profile = useProfile();
  const [busy, setBusy] = useState(false);

  async function start(m: PromptInputMessage) {
    if (!m.text.trim() && !m.files.length) return;
    setBusy(true);
    try {
      const files = await uploadFiles(m.files);
      const id = await createChat();
      setPending(id, { text: m.text, files });
      navigate({ to: "/c/$chatId", params: { chatId: id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start chat");
      setBusy(false);
      throw e;
    }
  }

  return (
    <AppShell>
      <div className="bg-brand-glow flex flex-1 flex-col items-center justify-center px-4 pb-10">
        <div className="w-full max-w-3xl">
          <h1 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">
            <span className="text-brand-gradient">Hello, {profile.data?.name ?? "there"}</span>
          </h1>
          <p className="mt-2 font-display text-3xl text-muted-foreground sm:text-4xl">How can I help today?</p>
          <div className="mt-10">
            <Composer onSubmit={start} status={busy ? "submitted" : undefined} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => start({ text: s, files: [] }).catch(() => {})}
                className="rounded-full border bg-card px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
