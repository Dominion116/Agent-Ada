"use client";

import { useEffect, useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";
import type { ChatMessage } from "@ada/shared";
import { useChatHistory } from "@/hooks/use-agent-data";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/section";
import { ChatThread } from "@/components/dashboard/chat-thread";
import { cn } from "@/lib/utils";

const QUICK_ACTIONS = ["Check yields", "What's my balance?", "Explain last run"];

function newMessage(role: ChatMessage["role"], content: string, payload: ChatMessage["payload"] = null): ChatMessage {
  return {
    id: crypto.randomUUID(),
    wallet_address: "",
    role,
    content,
    payload,
    created_at: new Date().toISOString(),
  };
}

export default function ChatPage() {
  const { messages: serverMessages, isLoading } = useChatHistory(true);
  const [thread, setThread] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const seeded = useRef(false);

  // Seed the local thread from history once, then own it locally.
  useEffect(() => {
    if (!seeded.current && serverMessages.length > 0) {
      setThread(serverMessages);
      seeded.current = true;
    }
  }, [serverMessages]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;

    setThread((t) => [...t, newMessage("user", content)]);
    setInput("");
    setSending(true);
    try {
      const res = await api.sendChat(content);
      const payload = (res.payload as ChatMessage["payload"]) ?? null;
      setThread((t) => [...t, newMessage("assistant", res.response, payload)]);
    } catch {
      setThread((t) => [
        ...t,
        newMessage("assistant", "Something went wrong reaching Ada. Please try again."),
      ]);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  const showEmptyHint = !isLoading && thread.length === 0 && !sending;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Chat" title="Talk to Ada" />

      <div className="flex h-[68vh] min-h-[440px] flex-col">
        {/* Thread */}
        <div className="flex-1 overflow-hidden">
          {showEmptyHint ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <p className="text-base font-semibold">Ask Ada anything about your treasury</p>
              <p className="max-w-[42ch] text-sm text-muted-foreground">
                Check yields, review your balance, propose a rebalance, or get your last run
                explained in plain language.
              </p>
            </div>
          ) : (
            <ChatThread messages={thread} typing={sending} className="h-full pr-1" />
          )}
        </div>

        {/* Composer */}
        <div className="mt-4 shrink-0 space-y-3">
          <div className="flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void send(q)}
                disabled={sending}
                className="rounded-full border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>

          <div className="flex items-end gap-2 rounded-xl border bg-card p-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Message Ada"
              className="max-h-32 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={() => void send(input)}
              disabled={sending || input.trim() === ""}
              aria-label="Send message"
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity",
                (sending || input.trim() === "") && "opacity-50",
              )}
            >
              <SendHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
