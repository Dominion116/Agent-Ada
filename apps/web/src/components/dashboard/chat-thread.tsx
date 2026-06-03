"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage, Route } from "@ada/shared";
import { QuoteCard } from "@/components/dashboard/quote-card";
import { cn } from "@/lib/utils";

/** Pull an inline route out of an assistant message payload, if present. */
function inlineQuote(payload: ChatMessage["payload"]): { route: Route; expiresAt?: string } | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const route = p["route"];
  if (route && typeof route === "object" && "net_gain_bps" in route) {
    return {
      route: route as Route,
      expiresAt: typeof p["expiresAt"] === "string" ? p["expiresAt"] : undefined,
    };
  }
  return null;
}

function TypingDots() {
  return (
    <div className="flex w-fit items-center gap-1.5 rounded-2xl border bg-card px-4 py-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

/**
 * Bottom-locked conversation. Renders user and assistant bubbles and an inline
 * QuoteCard when an assistant message carries a quote payload. Auto-scrolls to
 * the latest message and while Ada is typing.
 */
export function ChatThread({
  messages,
  typing = false,
  className,
}: {
  messages: ChatMessage[];
  typing?: boolean;
  className?: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, typing]);

  return (
    <div className={cn("space-y-4 overflow-y-auto", className)}>
      {messages.map((msg) => {
        const isUser = msg.role === "user";
        const quote = isUser ? null : inlineQuote(msg.payload);
        return (
          <div key={msg.id} className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
            {msg.content ? (
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed sm:max-w-[75%]",
                  isUser
                    ? "bg-primary text-primary-foreground"
                    : "border bg-card text-card-foreground",
                )}
              >
                {msg.content}
              </div>
            ) : null}
            {quote ? (
              <div className="mt-3 w-full max-w-[85%] sm:max-w-[75%]">
                <QuoteCard route={quote.route} expiresAt={quote.expiresAt} verdict="pass" />
              </div>
            ) : null}
          </div>
        );
      })}

      {typing ? (
        <div className="flex items-start">
          <TypingDots />
        </div>
      ) : null}

      <div ref={endRef} />
    </div>
  );
}
