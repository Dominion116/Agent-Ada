import type { Chain, Venue, RunStatus, RunMode, Run, Asset } from "@ada/shared";

/** Smallest-unit decimals per stablecoin. */
export const ASSET_DECIMALS: Record<Asset, number> = { cUSD: 18, USDC: 6 };

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

/** Format a raw bigint-string token amount to a human value with 2 decimals. */
export function formatTokenAmount(raw: string, asset: Asset): string {
  const decimals = ASSET_DECIMALS[asset];
  try {
    const value = BigInt(raw);
    const base = 10n ** BigInt(decimals);
    const whole = value / base;
    const hundredths = ((value % base) * 100n) / base;
    return `${Number(whole).toLocaleString("en-US")}.${hundredths.toString().padStart(2, "0")}`;
  } catch {
    return raw;
  }
}

/** The route stored on a run's outcome, if present. */
export function runRoute(run: Run): {
  asset?: Asset;
  amount_in?: string;
  source_chain?: Chain;
  source_venue?: Venue;
  dest_chain?: Chain;
  dest_venue?: Venue;
} | null {
  const outcome = (run.outcome ?? {}) as Record<string, unknown>;
  const route = outcome["route"] as Record<string, unknown> | undefined;
  if (!route) return null;
  return {
    asset: route["asset"] as Asset | undefined,
    amount_in: route["amount_in"] as string | undefined,
    source_chain: route["source_chain"] as Chain | undefined,
    source_venue: route["source_venue"] as Venue | undefined,
    dest_chain: route["dest_chain"] as Chain | undefined,
    dest_venue: route["dest_venue"] as Venue | undefined,
  };
}

/** Wall-clock duration of a run, e.g. "12s", "3m 4s". Null while unfinished. */
export function formatDuration(startIso: string, endIso: string | null): string | null {
  if (!endIso) return null;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

/** Celoscan transaction URL for a hash. */
export function celoscanTx(hash: string): string {
  return `https://celoscan.io/tx/${hash}`;
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
