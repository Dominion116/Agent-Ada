"use client";

import { useState } from "react";
import { CheckCheck, RefreshCw } from "lucide-react";
import type { Quote } from "@ada/shared";
import { useQuotes } from "@/hooks/use-agent-data";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/section";
import { EmptyState } from "@/components/dashboard/empty-state";
import { QuoteCard } from "@/components/dashboard/quote-card";
import { Button } from "@/components/ui/button";

// Per-quote action state so one card's loading never blocks another.
type ActionState = { approving: boolean; error: string | null };
type ActionMap = Record<string, ActionState>;

function QuoteCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border bg-card p-6">
      <div className="mb-5 flex items-center justify-between">
        <div className="h-3 w-28 rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-5 w-20 rounded bg-muted" />
          <div className="h-5 w-24 rounded bg-muted" />
        </div>
      </div>
      <div className="mb-5 flex items-center gap-3">
        <div className="h-4 w-16 rounded bg-muted" />
        <div className="h-4 w-4 rounded bg-muted" />
        <div className="h-4 w-16 rounded bg-muted" />
      </div>
      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-14 rounded bg-muted" />
            <div className="h-6 w-20 rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="h-11 w-44 rounded-md bg-muted" />
    </div>
  );
}

// Map a Quote from the API to the shape QuoteCard expects.
function quoteToCardProps(q: Quote) {
  return {
    route: {
      source_chain: q.source_chain,
      source_venue: q.source_venue,
      dest_chain: q.dest_chain,
      dest_venue: q.dest_venue,
      asset: q.asset,
      amount_in: q.amount,
      amount_out: q.amount,       // not yet known until execution
      route_cost_bps: q.route_cost_bps,
      net_gain_bps: q.net_gain_bps,
      payback_days: q.payback_days,
      estimated_time_seconds: 0,
      lifi_route: null,
    },
    expiresAt: q.expires_at,
  } as const;
}

export default function ApprovalsPage() {
  const { quotes, isLoading, error: fetchError, mutate } = useQuotes(true);
  const [actions, setActions] = useState<ActionMap>({});

  function setAction(id: string, patch: Partial<ActionState>) {
    setActions((prev) => {
      const current: ActionState = prev[id] ?? { approving: false, error: null };
      return { ...prev, [id]: { ...current, ...patch } };
    });
  }

  async function handleApprove(q: Quote) {
    setAction(q.id, { approving: true, error: null });
    try {
      await api.execute(q.approval_token);
      // Remove approved quote from the list optimistically.
      await mutate(
        (prev) => prev ? { quotes: prev.quotes.filter((x) => x.id !== q.id) } : prev,
        { revalidate: true },
      );
    } catch (err) {
      setAction(q.id, {
        approving: false,
        error: err instanceof ApiError ? err.message : "Execution failed. Please try again.",
      });
    }
  }

  async function handleReject(q: Quote) {
    // Optimistically remove, then ask the server, then revalidate.
    await mutate(
      (prev) => prev ? { quotes: prev.quotes.filter((x) => x.id !== q.id) } : prev,
      { revalidate: false },
    );
    try {
      await api.rejectQuote(q.id);
    } finally {
      mutate();
    }
  }

  const pendingQuotes = quotes.filter(
    (q) => new Date(q.expires_at).getTime() > Date.now(),
  );
  const expiredQuotes = quotes.filter(
    (q) => new Date(q.expires_at).getTime() <= Date.now(),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Approvals"
        title="Quotes awaiting your call"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutate()}
            disabled={isLoading}
            aria-label="Refresh quotes"
          >
            <RefreshCw className={isLoading ? "animate-spin" : ""} />
            Refresh
          </Button>
        }
      />

      {fetchError ? (
        <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load quotes. The backend may not be reachable yet.
        </p>
      ) : null}

      {/* Loading skeletons on first fetch */}
      {isLoading && quotes.length === 0 ? (
        <div className="space-y-4">
          <QuoteCardSkeleton />
          <QuoteCardSkeleton />
        </div>
      ) : null}

      {/* Pending quotes */}
      {!isLoading && pendingQuotes.length === 0 && expiredQuotes.length === 0 ? (
        <EmptyState
          eyebrow="Nothing pending"
          title="No quotes waiting for approval"
          description="When a scan finds a rebalance that passes your policy, it lands here with the route cost, net gain, and an expiry countdown. Ada checks every 15 seconds for new quotes."
          icon={<CheckCheck className="h-8 w-8" />}
        />
      ) : null}

      {pendingQuotes.length > 0 ? (
        <section className="space-y-4">
          {pendingQuotes.map((q) => {
            const state = actions[q.id];
            const { route, expiresAt } = quoteToCardProps(q);
            return (
              <div key={q.id} className="space-y-2">
                <QuoteCard
                  route={route}
                  expiresAt={expiresAt}
                  verdict="pass"
                  onApprove={() => handleApprove(q)}
                  onReject={() => handleReject(q)}
                  approving={state?.approving ?? false}
                />
                {state?.error ? (
                  <p className="px-1 text-sm text-destructive">{state.error}</p>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : null}

      {/* Expired quotes shown separately, actions disabled */}
      {expiredQuotes.length > 0 ? (
        <section className="space-y-4">
          <p className="eyebrow text-muted-foreground">Expired</p>
          {expiredQuotes.map((q) => {
            const { route, expiresAt } = quoteToCardProps(q);
            return (
              <QuoteCard
                key={q.id}
                route={route}
                expiresAt={expiresAt}
                verdict="pass"
                onReject={() => handleReject(q)}
                className="opacity-60"
              />
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
