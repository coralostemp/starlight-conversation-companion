import type { ChatStatus } from "ai";
import { Paperclip, X } from "lucide-react";
import { toast } from "sonner";

import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { ACCEPT, MAX_FILE_SIZE } from "@/lib/chat-client";

function AttachButton() {
  const a = usePromptInputAttachments();
  return (
    <PromptInputButton onClick={() => a.openFileDialog()} aria-label="Add images or PDFs" tooltip="Add images or PDFs">
      <Paperclip className="size-4" />
    </PromptInputButton>
  );
}

function AttachmentChips() {
  const a = usePromptInputAttachments();
  if (!a.files.length) return null;
  return (
    <div className="flex w-full flex-wrap gap-2 px-3 pt-3">
      {a.files.map((f) => (
        <div key={f.id} className="relative flex items-center gap-2 rounded-xl border bg-muted p-1.5 pr-7 text-xs">
          {f.mediaType.startsWith("image/") ? (
            <img src={f.url} alt={f.filename} className="size-10 rounded-lg object-cover" />
          ) : (
            <div className="flex size-10 items-center justify-center rounded-lg bg-accent font-semibold">PDF</div>
          )}
          <span className="max-w-32 truncate">{f.filename}</span>
          <button
            type="button"
            onClick={() => a.remove(f.id)}
            className="absolute top-1 right-1 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Remove attachment"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Composer({
  onSubmit,
  status,
  onStop,
}: {
  onSubmit: (m: PromptInputMessage) => void | Promise<void>;
  status?: ChatStatus;
  onStop?: () => void;
}) {
  return (
    <PromptInput
      onSubmit={onSubmit}
      accept={ACCEPT}
      multiple
      globalDrop
      maxFileSize={MAX_FILE_SIZE}
      onError={(e) => toast.error(e.code === "max_file_size" ? "Files must be 10MB or smaller." : e.message)}
      className="rounded-3xl bg-composer [&_[data-slot=input-group]]:rounded-3xl"
    >
      <AttachmentChips />
      <PromptInputTextarea autoFocus placeholder="Ask Open Finder" className="px-5 pt-4 text-base" />
      <PromptInputFooter>
        <PromptInputTools>
          <AttachButton />
        </PromptInputTools>
        <PromptInputSubmit status={status} onStop={onStop} className="rounded-full" />
      </PromptInputFooter>
    </PromptInput>
  );
}
