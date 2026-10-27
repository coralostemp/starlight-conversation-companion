import type { FileUIPart, UIMessage } from "ai";

import { supabase } from "@/integrations/supabase/client";

export type Draft = { text: string; files: FileUIPart[] };

// Message typed on the home screen, handed to the new chat page once.
const pending = new Map<string, Draft>();
export const setPending = (id: string, d: Draft) => pending.set(id, d);
export const takePending = (id: string) => {
  const d = pending.get(id);
  pending.delete(id);
  return d;
};

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const ACCEPT = "image/*,application/pdf";

async function toBlob(url: string) {
  const res = await fetch(url);
  return res.blob();
}

/** Uploads composer files to private storage and returns parts that point at them. */
export async function uploadFiles(files: FileUIPart[]): Promise<FileUIPart[]> {
  if (!files.length) return [];
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error("Please sign in again.");
  return Promise.all(
    files.map(async (f) => {
      const blob = await toBlob(f.url);
      const safe = (f.filename ?? "file").replace(/[^\w.-]+/g, "_").slice(-80);
      const path = `${uid}/${crypto.randomUUID()}-${safe}`;
      const { error } = await supabase.storage
        .from("attachments")
        .upload(path, blob, { contentType: f.mediaType, upsert: false });
      if (error) throw new Error(`Could not upload ${f.filename ?? "file"}: ${error.message}`);
      return { type: "file" as const, mediaType: f.mediaType, url: `storage:${path}`, ...(f.filename ? { filename: f.filename } : {}) } as FileUIPart;
    }),
  );
}

export async function createChat() {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Please sign in again.");
  const { data, error } = await supabase
    .from("chats")
    .insert({ user_id: u.user.id })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function fetchChats() {
  const { data, error } = await supabase
    .from("chats")
    .select("id,title,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchMessages(chatId: string): Promise<UIMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("ui_id,role,parts,created_at")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map((m) => ({
    id: m.ui_id,
    role: m.role as UIMessage["role"],
    parts: m.parts as unknown as UIMessage["parts"],
  }));
}
