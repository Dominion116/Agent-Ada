import type { Chain, Venue, RunStatus, RunMode } from "@ada/shared";

/** Human labels for chains, venues, and assets used across the dashboard. */
export const CHAIN_LABEL: Record<Chain, string> = {
  celo: "Celo",
  base: "Base",
  polygon: "Polygon",
  arbitrum: "Arbitrum",
  optimism: "Optimism",
};

/** Brand-adjacent dot color per chain, used by NetworkBadge. */
export const CHAIN_COLOR: Record<Chain, string> = {
  celo: "#fcff52",
  base: "#0052ff",
  polygon: "#8247e5",
  arbitrum: "#28a0f0",
  optimism: "#ff0420",
};

export const VENUE_LABEL: Record<Venue, string> = {
  moola: "Moola",
  "aave-v3": "Aave V3",
};

/** Map a run status to a badge variant and label. */
export function runStatusBadge(status: RunStatus): {
  variant: "success" | "warning" | "destructive" | "neutral";
  label: string;
} {
  switch (status) {
    case "completed":
      return { variant: "success", label: "Completed" };
    case "executing":
    case "pending":
      return { variant: "warning", label: status === "pending" ? "Pending" : "Executing" };
    case "failed":
      return { variant: "destructive", label: "Failed" };
    case "dry_run_complete":
      return { variant: "neutral", label: "Dry run" };
  }
}

export function runModeBadge(mode: RunMode): {
  variant: "info" | "neutral";
  label: string;
} {
  return mode === "live"
    ? { variant: "info", label: "Live" }
    : { variant: "neutral", label: "Dry run" };
}

/** Compact relative time, e.g. "3m ago", "2h ago", "5d ago". */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
