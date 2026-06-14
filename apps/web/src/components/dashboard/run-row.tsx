"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import type { Run, TxRecord } from "@ada/shared";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NetworkBadge } from "@/components/dashboard/network-badge";
import { truncateAddress, cn } from "@/lib/utils";
import {
  VENUE_LABEL,
  runModeBadge,
  runStatusBadge,
  runRoute,
  formatTokenAmount,
  formatDuration,
  celoscanTx,
  timeAgo,
} from "@/lib/format";

function txStatusVariant(status: TxRecord["status"]): "success" | "warning" | "destructive" {
  if (status === "confirmed") return "success";
  if (status === "pending") return "warning";
  return "destructive"; // failed | reverted
}

/**
 * One row in the runs list. Collapsed it shows mode, status, amount, time, and
 * duration. Expanded it reveals each transaction with its hash linked to
 * Celoscan, which is the proof that Ada executed on chain.
 */
export function RunRow({ run }: { run: Run }) {
  const [open, setOpen] = useState(false);

  const mode = runModeBadge(run.mode);
  const status = runStatusBadge(run.status);
  const route = runRoute(run);
  const amount =
    route?.amount_in && route.asset
      ? `${formatTokenAmount(route.amount_in, route.asset)} ${route.asset}`
      : "No amount";
  const duration = formatDuration(run.started_at, run.completed_at);
  const txs = run.tx_hashes ?? [];

  return (
    <Card className="overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* Badges */}
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={mode.variant}>{mode.label}</Badge>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>

        {/* Amount + route */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tabular-nums">{amount}</p>
          {route?.source_chain && route?.dest_chain ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {VENUE_LABEL[route.source_venue!]} on {route.source_chain} to{" "}
              {VENUE_LABEL[route.dest_venue!]} on {route.dest_chain}
            </p>
          ) : null}
        </div>

        {/* Time + duration */}
        <div className="shrink-0 text-right">
          <p className="text-xs text-muted-foreground sm:text-sm">{timeAgo(run.started_at)}</p>
          <p className="hidden text-xs text-muted-foreground sm:block">
            {duration ? `Took ${duration}` : "In progress"}
          </p>
        </div>

        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="border-t bg-muted/30 px-4 py-4">
          <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span>
              Started <span className="text-foreground">{new Date(run.started_at).toLocaleString()}</span>
            </span>
            <span>
              Policy <span className="text-foreground">v{run.policy_version}</span>
            </span>
            {route?.dest_chain ? (
              <span className="flex items-center gap-1.5">
                Destination <NetworkBadge chain={route.dest_chain} />
              </span>
            ) : null}
          </div>

          {txs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No transactions. This was a simulation, so no funds moved.
            </p>
          ) : (
            <ul className="space-y-2">
              {txs.map((tx, i) => (
                <li
                  key={`${tx.step}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold capitalize">{tx.step}</span>
                    <Badge variant={txStatusVariant(tx.status)}>{tx.status}</Badge>
                    {tx.block_number !== null ? (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        Block {tx.block_number.toLocaleString()}
                      </span>
                    ) : null}
                  </div>
                  {tx.hash ? (
                    <a
                      href={celoscanTx(tx.hash)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      <span className="tabular-nums">{truncateAddress(tx.hash, 6)}</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">No hash yet</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </Card>
  );
}
