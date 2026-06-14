"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import type { Asset, Route } from "@ada/shared";
import { useYields, useBalance, useRuns, usePolicy } from "@/hooks/use-agent-data";
import { api, ApiError } from "@/lib/api";
import { PageHeader, Section } from "@/components/dashboard/section";
import { YieldCard } from "@/components/dashboard/yield-card";
import { QuoteCard } from "@/components/dashboard/quote-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatTokenAmount, runModeBadge, runStatusBadge, timeAgo } from "@/lib/format";

type Quote = { quoteId: string; route: Route; approvalToken: string; expiresAt: string };

export default function OverviewPage() {
  const { yields, isLoading: yieldsLoading, error: yieldsError } = useYields();
  const { balances } = useBalance(true);
  const { runs, mutate: mutateRuns } = useRuns(true, 1);
  const { policy } = usePolicy(true);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Sort yields by APR; the top one is the best available opportunity.
  const sorted = useMemo(
    () => [...yields].sort((a, b) => b.supply_rate_bps - a.supply_rate_bps),
    [yields],
  );
  const latestRun = runs[0];

  async function findRebalance() {
    setQuoting(true);
    setError(null);
    setInfo(null);
    try {
      const cusd = balances.find((b) => b.asset === "cUSD");
      const result = await api.quote(cusd?.raw ?? "0", "cUSD");
      setQuote(result);
    } catch (err) {
      // A 422 means Ada looked and found nothing actionable (no profitable
      // route, or no policy yet); that's a normal outcome, not a failure.
      if (err instanceof ApiError && err.status === 422) {
        setInfo(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : "Could not build a quote right now.");
      }
    } finally {
      setQuoting(false);
    }
  }

  async function approve() {
    if (!quote) return;
    setExecuting(true);
    setError(null);
    try {
      await api.execute(quote.approvalToken);
      setQuote(null);
      mutateRuns();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Execution failed.");
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Overview"
        title="Your treasury at a glance"
        action={
          <Button size="lg" onClick={findRebalance} disabled={quoting}>
            <Sparkles className="h-4 w-4" />
            {quoting ? "Scanning…" : "Find a rebalance"}
          </Button>
        }
      />

      {error ? (
        <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      ) : null}

      {info ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
          <span>{info}</span>
          {!policy ? (
            <Link
              href="/dashboard/policies"
              className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline"
            >
              Set up a policy <ArrowUpRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* Latest run banner */}
      {latestRun ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <Badge variant={runModeBadge(latestRun.mode).variant}>
              {runModeBadge(latestRun.mode).label}
            </Badge>
            <Badge variant={runStatusBadge(latestRun.status).variant}>
              {runStatusBadge(latestRun.status).label}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Last run {timeAgo(latestRun.started_at)}
            </span>
          </div>
          <Link
            href="/dashboard/runs"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            View runs <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Card>
      ) : null}

      {/* Proposed rebalance, shown after a scan */}
      {quote ? (
        <Section eyebrow="Proposed">
          <QuoteCard
            route={quote.route}
            expiresAt={quote.expiresAt}
            onApprove={approve}
            onReject={() => setQuote(null)}
            approving={executing}
          />
        </Section>
      ) : null}

      {/* Balances */}
      {balances.length > 0 ? (
        <Section eyebrow="Balances">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {balances.map((b) => (
              <Card key={b.asset} className="p-5">
                <p className="truncate text-3xl font-bold tabular-nums" title={b.formatted}>
                  {formatTokenAmount(b.raw, b.asset as Asset)}
                </p>
                <p className="mt-1 eyebrow text-muted-foreground">{b.asset}</p>
              </Card>
            ))}
          </div>
        </Section>
      ) : null}

      {/* Yield opportunities */}
      <Section eyebrow="Top opportunities">
        {yieldsLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl border bg-card" />
            ))}
          </div>
        ) : yieldsError || sorted.length === 0 ? (
          <EmptyState
            eyebrow="No data yet"
            title="Yields are not available right now"
            description="Ada could not reach the yield service. It will refresh automatically once the backend is live."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((y, i) => (
              <YieldCard
                key={`${y.chain}-${y.venue}-${y.asset}`}
                data={y}
                label={i === 0 ? "Best" : undefined}
                highlight={i === 0}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
