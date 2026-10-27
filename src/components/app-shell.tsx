import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { LogOut, MoreHorizontal, PanelLeft, Pencil, SquarePen, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import logo from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { fetchChats } from "@/lib/chat-client";
import { cn } from "@/lib/utils";

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("profiles").select("display_name").eq("id", u.user.id).maybeSingle();
      return { email: u.user.email ?? "", name: data?.display_name || u.user.email?.split("@")[0] || "there" };
    },
  });
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const params = useParams({ strict: false }) as { chatId?: string };
  const chats = useQuery({ queryKey: ["chats"], queryFn: fetchChats });
  const profile = useProfile();

  async function rename(id: string, current: string) {
    const title = window.prompt("Rename chat", current)?.trim();
    if (!title) return;
    const { error } = await supabase.from("chats").update({ title }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["chats"] });
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this chat?")) return;
    const { error } = await supabase.from("chats").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["chats"] });
    if (params.chatId === id) navigate({ to: "/" });
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className={cn(
          "flex shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200",
          open ? "w-72" : "w-16",
        )}
      >
        <div className="flex items-center gap-2 p-3">
          <Button variant="ghost" size="icon" onClick={() => setOpen(!open)} aria-label="Toggle menu">
            <PanelLeft className="size-5" />
          </Button>
          {open && (
            <Link to="/" className="flex items-center gap-2 font-display text-lg font-semibold">
              <img src={logo} alt="" width={24} height={24} className="size-6" />
              Open Finder
            </Link>
          )}
        </div>
        <div className="px-3">
          <Button
            variant="ghost"
            className={cn("w-full justify-start gap-3", !open && "w-10 justify-center px-0")}
            onClick={() => navigate({ to: "/" })}
          >
            <SquarePen className="size-5 shrink-0" />
            {open && "New chat"}
          </Button>
        </div>
        <div className="mt-4 flex-1 overflow-y-auto px-3">
          {open && (
            <>
              <p className="px-3 pb-2 text-xs font-medium text-muted-foreground">Recent</p>
              {chats.data?.length === 0 && <p className="px-3 text-sm text-muted-foreground">No chats yet</p>}
              <ul className="space-y-0.5">
                {chats.data?.map((c) => (
                  <li
                    key={c.id}
                    className={cn(
                      "group flex items-center rounded-full pr-1 hover:bg-sidebar-accent",
                      params.chatId === c.id && "bg-sidebar-accent",
                    )}
                  >
                    <Link
                      to="/c/$chatId"
                      params={{ chatId: c.id }}
                      className="min-w-0 flex-1 truncate px-3 py-2 text-sm"
                    >
                      {c.title}
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                          aria-label="Chat options"
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => rename(c.id, c.title)}>
                          <Pencil className="size-4" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => remove(c.id)} className="text-destructive">
                          <Trash2 className="size-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="border-t border-sidebar-border p-3">
          <div className={cn("flex items-center gap-3", !open && "justify-center")}>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground">
              {profile.data?.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            {open && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{profile.data?.name}</p>
                <p className="truncate text-xs text-muted-foreground">{profile.data?.email}</p>
              </div>
            )}
            {open && (
              <Button variant="ghost" size="icon-sm" onClick={signOut} aria-label="Sign out">
                <LogOut className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </aside>
      <main className="relative flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
