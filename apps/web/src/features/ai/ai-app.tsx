"use client";

import type { ChatItem, HanaMood } from "@hanabrew/contracts";
import { Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useOpenApp } from "@/features/desktop/use-open-app";
import { useTimeZone } from "@/features/settings/use-time-zone";
import { errorMessageOf } from "@/lib/api-client";
import { ActionCard, Bubble } from "./chat-items";
import { HanaAvatar } from "./hana-avatar";
import { useAiOverview, useChatMutations, useConversation, useConversations } from "./use-ai";

const SLEEP_AFTER_MS = 5 * 60_000;
const STARTERS = ["What's on my plate today?", "Plan my week", "Add a task for tomorrow"];

export function AiApp() {
  const { timeZone } = useTimeZone();
  const openApp = useOpenApp();
  const overview = useAiOverview();
  const conversations = useConversations();
  const { send, decide, remove } = useChatMutations();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asleep, setAsleep] = useState(false);
  const detail = useConversation(conversationId);
  const bottom = useRef<HTMLDivElement>(null);
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const items: ChatItem[] = detail.data?.items ?? [];
  const pendingCount = detail.data?.pendingCount ?? 0;
  const ready = overview.data?.activeProvider != null;

  // Hana naps after a quiet spell. Any activity wakes her.
  useEffect(() => {
    setAsleep(false);
    clearTimeout(sleepTimer.current);
    sleepTimer.current = setTimeout(() => setAsleep(true), SLEEP_AFTER_MS);
    return () => clearTimeout(sleepTimer.current);
  }, [draft, sending, items.length]);

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: "end" });
  }, [items.length, sending]);

  // What the avatar shows: what's happening now wins over what Hana last felt.
  const mood: HanaMood =
    sending || decide.isPending
      ? "thinking"
      : typing && draft.trim()
        ? "listening"
        : asleep
          ? "sleeping"
          : (detail.data?.hana.mood ?? "idle");
  const suggestions =
    items.length === 0 && !sending ? STARTERS : (detail.data?.hana.suggestions ?? []);

  async function submit(text: string) {
    const message = text.trim();
    if (!message || sending || !ready) return;
    setError(null);
    setSending(message);
    setDraft("");
    try {
      const response = await send.mutateAsync({ message, conversationId, timeZone });
      setConversationId(response.id);
    } catch (e) {
      setDraft(message); // nothing was kept on the server, so let them retry with one click
      setError(errorMessageOf(e));
    } finally {
      setSending(null);
    }
  }

  async function onDecide(id: string, decision: "approve" | "reject") {
    setError(null);
    try {
      await decide.mutateAsync({ id, decision });
    } catch (e) {
      setError(errorMessageOf(e));
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit(draft);
    }
  }

  async function deleteCurrent() {
    if (!conversationId) return;
    await remove.mutateAsync(conversationId);
    setConversationId(null);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border p-3">
        <HanaAvatar mood={mood} />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Hana</h2>
          <p className="truncate text-xs text-muted" aria-live="polite">
            {mood === "thinking"
              ? "Thinking…"
              : mood === "sleeping"
                ? "Zzz… say something to wake me"
                : mood === "listening"
                  ? "Listening…"
                  : "Your cozy assistant"}
          </p>
        </div>
        <Select
          aria-label="Conversation"
          className="max-w-40"
          value={conversationId ?? ""}
          onChange={(e) => setConversationId(e.target.value || null)}
        >
          <option value="">New chat</option>
          {(conversations.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </Select>
        {conversationId && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete this conversation"
            title="Delete this conversation"
            disabled={remove.isPending}
            onClick={() => void deleteCurrent()}
          >
            <Trash2 aria-hidden className="size-4" />
          </Button>
        )}
      </header>

      <div
        className="min-h-0 flex-1 space-y-3 overflow-auto p-3"
        aria-label="Conversation with Hana"
      >
        {overview.isSuccess && !ready && (
          <div className="rounded-xl border border-border bg-surface p-4 text-sm">
            <p className="font-semibold">Set up Hana</p>
            <p className="mt-1 text-muted">
              Hana needs an AI provider before she can chat: a Gemini or Groq key, or a local Ollama
              model. Your keys stay on the server and are never sent to the browser.
            </p>
            <Button className="mt-3" onClick={() => openApp("settings")}>
              Open AI settings
            </Button>
          </div>
        )}

        {items.length === 0 && !sending && ready && (
          <p className="py-6 text-center text-sm text-muted">
            Hi! I can look after your tasks, projects and calendar. What shall we do?
          </p>
        )}

        {items.map((item) =>
          item.type === "action" ? (
            <ActionCard
              key={item.id}
              item={item}
              busy={decide.isPending}
              onDecide={(id, d) => void onDecide(id, d)}
            />
          ) : (
            <Bubble key={item.id} role={item.type}>
              {item.content}
            </Bubble>
          ),
        )}
        {sending && <Bubble role="user">{sending}</Bubble>}
        {sending && (
          <p role="status" className="text-xs text-muted">
            Hana is thinking…
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <div ref={bottom} />
      </div>

      <div className="border-t border-border p-3">
        {suggestions.length > 0 && ready && !pendingCount && (
          <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Suggestions">
            {suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  disabled={!!sending}
                  onClick={() => void submit(s)}
                  className="rounded-full border border-border px-3 py-1 text-xs hover:bg-accent/30 disabled:opacity-50"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
        {pendingCount > 0 && (
          <p className="mb-2 text-xs text-muted">
            Approve or decline above. If you send a new message instead, I’ll treat waiting requests
            as declined.
          </p>
        )}
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void submit(draft);
          }}
          className="flex items-end gap-2"
        >
          <Textarea
            aria-label="Message Hana"
            placeholder={ready ? "Ask Hana…" : "Set up an AI provider first"}
            rows={1}
            value={draft}
            maxLength={4000}
            disabled={!ready}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setTyping(true)}
            onBlur={() => setTyping(false)}
            className="min-h-10 max-h-32 resize-none"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send"
            disabled={!ready || !!sending || !draft.trim()}
            className="size-10 shrink-0"
          >
            <Send aria-hidden className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
