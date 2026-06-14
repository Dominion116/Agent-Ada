"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { Route } from "@ada/shared";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NetworkBadge } from "@/components/dashboard/network-badge";
import { bpsToPercent, cn } from "@/lib/utils";
import { VENUE_LABEL } from "@/lib/format";

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="eyebrow text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-bold tabular-nums",
          accent ? "text-success" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function useCountdown(expiresAt?: string): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now;
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return "Expired";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * A proposed rebalance. Source to destination, the numbers that matter, the
 * policy verdict, an expiry countdown, and exactly one primary action.
 */
export function QuoteCard({
  route,
  expiresAt,
  verdict = "pass",
  reason,
  comingSoon = false,
  onApprove,
  onReject,
  approving = false,
  className,
}: {
  route: Route;
  expiresAt?: string;
  verdict?: "pass" | "fail";
  reason?: string;
  /** Route type is supported (passes policy) but execution isn't built yet — disables approve. */
  comingSoon?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  approving?: boolean;
  className?: string;
}) {
  const countdown = useCountdown(expiresAt);
  const expired = countdown === "Expired";

  return (
    <Card className={cn("flex flex-col gap-5 p-6", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow text-muted-foreground">Proposed rebalance</p>
        <div className="flex items-center gap-2">
          {countdown ? (
            <Badge variant={expired ? "destructive" : "warning"}>
              {expired ? "Expired" : `Expires ${countdown}`}
            </Badge>
          ) : null}
          <Badge variant={verdict === "pass" ? "success" : "destructive"}>
            {verdict === "pass" ? "Passes policy" : "Blocked"}
          </Badge>
          {comingSoon ? <Badge variant="info">Coming soon</Badge> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
        <span className="flex items-center gap-2">
          <NetworkBadge chain={route.source_chain} />
          <span className="text-muted-foreground">{VENUE_LABEL[route.source_venue]}</span>
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" aria-label="to" />
        <span className="flex items-center gap-2">
          <NetworkBadge chain={route.dest_chain} />
          <span className="text-muted-foreground">{VENUE_LABEL[route.dest_venue]}</span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Metric label="Net gain" value={`+${bpsToPercent(route.net_gain_bps)}`} accent />
        <Metric label="Route cost" value={bpsToPercent(route.route_cost_bps)} />
        <Metric label="Payback" value={`${Math.ceil(route.payback_days)}d`} />
        <Metric label="Move" value={`${route.amount_in} ${route.asset}`} />
      </div>

      {reason ? <p className="text-sm text-muted-foreground">{reason}</p> : null}

      {(onApprove || onReject) && (
        <div className="flex flex-col gap-3 sm:flex-row">
          {onApprove ? (
            <Button
              className="w-full sm:w-auto"
              size="lg"
              onClick={onApprove}
              disabled={approving || expired || verdict === "fail" || comingSoon}
            >
              {approving ? "Submitting…" : "Approve and execute"}
            </Button>
          ) : null}
          {onReject ? (
            <Button variant="ghost" size="lg" onClick={onReject} disabled={approving}>
              Reject
            </Button>
          ) : null}
        </div>
      )}
    </Card>
  );
}
