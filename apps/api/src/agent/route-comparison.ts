import type { YieldData, Route, Policy, Chain, Venue, Asset } from "@ada/shared";
import { USDC_ADDRESSES, type LifiQuoter, type LifiQuoteResult } from "./lifi-client.js";
import { CELO_ASSETS } from "../onchain/celo-client.js";

// ── Constants ─────────────────────────────────────────────────

/** System-level cap on payback window. Users cannot exceed this even with a
 *  permissive policy; it protects against moves that take years to recoup. */
const SYSTEM_MAX_PAYBACK_DAYS = 90;

/** Default days used if policy doesn't specify (matches PRD default of 30). */
const DEFAULT_MAX_PAYBACK_DAYS = 30;

// ── Math helpers ─────────────────────────────────────────────

/**
 * Basis points cost of a bridge move as a fraction of principal.
 * routeCostBps = (amountIn - amountOut) * 10_000 / amountIn
 */
export function computeRouteCostBps(amountIn: bigint, amountOut: bigint): number {
  if (amountIn === 0n) return 0;
  const cost = amountIn > amountOut ? amountIn - amountOut : 0n;
  return Number((cost * 10_000n) / amountIn);
}

/**
 * Days to recover the one-time bridge cost from the incremental annual yield.
 * paybackDays = (routeCostBps / gainDiffBps) * 365
 *
 * Returns Infinity when gainDiffBps ≤ 0 (destination is not better).
 */
export function computePaybackDays(routeCostBps: number, gainDiffBps: number): number {
  if (gainDiffBps <= 0) return Infinity;
  return (routeCostBps / gainDiffBps) * 365;
}

/**
 * Annual yield improvement in BPS from moving to the destination venue.
 * netGainBps = destRateBps - sourceRateBps
 * (Route cost is one-time; we report it separately.)
 */
export function computeNetGainBps(sourceRateBps: number, destRateBps: number): number {
  return destRateBps - sourceRateBps;
}

// ── Route candidate builder ──────────────────────────────────

export interface RouteCandidate {
  route: Route;
  passesPolicy: boolean;
  rejectionReason: string | null;
}

function buildCeloOnlyRoute(
  source: YieldData,
  dest: YieldData,
  amountIn: bigint,
): Route {
  return {
    source_chain: source.chain as Chain,
    source_venue: source.venue as Venue,
    dest_chain: dest.chain as Chain,
    dest_venue: dest.venue as Venue,
    asset: source.asset as Asset,
    amount_in: amountIn.toString(),
    amount_out: amountIn.toString(), // no bridge cost
    route_cost_bps: 0,
    net_gain_bps: computeNetGainBps(source.supply_rate_bps, dest.supply_rate_bps),
    payback_days: 0,
    estimated_time_seconds: 60, // local tx; ~1 block
    lifi_route: null,
  };
}

function buildCrossChainRoute(
  source: YieldData,
  dest: YieldData,
  quote: LifiQuoteResult,
): Route {
  const routeCostBps = computeRouteCostBps(quote.fromAmount, quote.toAmount);
  const netGainBps = computeNetGainBps(source.supply_rate_bps, dest.supply_rate_bps);
  const paybackDays = computePaybackDays(routeCostBps, netGainBps);

  return {
    source_chain: source.chain as Chain,
    source_venue: source.venue as Venue,
    dest_chain: dest.chain as Chain,
    dest_venue: dest.venue as Venue,
    asset: source.asset as Asset,
    amount_in: quote.fromAmount.toString(),
    amount_out: quote.toAmount.toString(),
    route_cost_bps: routeCostBps,
    net_gain_bps: netGainBps,
    payback_days: paybackDays,
    estimated_time_seconds: quote.estimatedSeconds,
    lifi_route: quote.rawRoute,
  };
}

// ── Policy evaluation ────────────────────────────────────────

export function evaluateRouteAgainstPolicy(
  route: Route,
  policy: Pick<Policy, "min_net_gain_bps" | "max_route_cost_bps" | "allowed_chains" | "allowed_venues">,
  maxPaybackDays = DEFAULT_MAX_PAYBACK_DAYS,
): { pass: boolean; reason: string | null } {
  const effectiveMaxPayback = Math.min(maxPaybackDays, SYSTEM_MAX_PAYBACK_DAYS);

  if (route.net_gain_bps < policy.min_net_gain_bps) {
    return {
      pass: false,
      reason: `net_gain_bps ${route.net_gain_bps} < min ${policy.min_net_gain_bps}`,
    };
  }
  if (route.route_cost_bps > policy.max_route_cost_bps) {
    return {
      pass: false,
      reason: `route_cost_bps ${route.route_cost_bps} > max ${policy.max_route_cost_bps}`,
    };
  }
  if (route.payback_days > effectiveMaxPayback) {
    return {
      pass: false,
      reason: `payback_days ${route.payback_days.toFixed(1)} > max ${effectiveMaxPayback}`,
    };
  }
  if (!policy.allowed_chains.includes(route.dest_chain)) {
    return { pass: false, reason: `chain ${route.dest_chain} not in allowed_chains` };
  }
  if (!policy.allowed_venues.includes(route.dest_venue)) {
    return { pass: false, reason: `venue ${route.dest_venue} not in allowed_venues` };
  }

  return { pass: true, reason: null };
}

// ── Main orchestrator ─────────────────────────────────────────

export interface FindBestRouteOptions {
  lifi: LifiQuoter;
  source: YieldData;          // user's current position yield
  allYields: YieldData[];     // full yield snapshot from getYields()
  policy: Policy;
  amountIn: bigint;           // principal in atomic units
  fromAddress: `0x${string}`; // agent or user wallet for LI.FI quote
}

/**
 * Finds the best rebalance route for a user given their current position,
 * available yields, and policy constraints.
 *
 * Cross-chain routes are quoted via LI.FI.
 * Same-chain routes (different venue) have zero bridge cost.
 * cUSD is treated as Celo-only (not bridgeable cross-chain).
 *
 * Returns null when no candidate passes policy, or the yield snapshot
 * contains no better destination than the current position.
 *
 * On LI.FI failure, falls back to Celo-only destinations.
 */
export async function findBestRoute(opts: FindBestRouteOptions): Promise<Route | null> {
  const { lifi, source, allYields, policy, amountIn, fromAddress } = opts;

  // Destination candidates: different from source, in allowed chains+venues.
  const destinations = allYields.filter(
    (y) =>
      !(y.chain === source.chain && y.venue === source.venue) &&
      y.asset === source.asset &&
      policy.allowed_chains.includes(y.chain as Chain) &&
      policy.allowed_venues.includes(y.venue as Venue),
  );

  if (destinations.length === 0) return null;

  const candidates: Route[] = [];

  for (const dest of destinations) {
    if (dest.chain === source.chain) {
      // Same-chain move — no bridge needed.
      candidates.push(buildCeloOnlyRoute(source, dest, amountIn));
    } else {
      // Cross-chain — cUSD cannot be bridged; skip.
      if (source.asset === "cUSD") continue;

      const fromToken = USDC_ADDRESSES[source.chain as Chain] ?? CELO_ASSETS.USDC;
      const toToken = USDC_ADDRESSES[dest.chain as Chain];
      if (!toToken) continue;

      try {
        const quote = await lifi.getQuote({
          fromChain: source.chain as Chain,
          toChain: dest.chain as Chain,
          fromTokenAddress: fromToken,
          toTokenAddress: toToken,
          fromAmount: amountIn,
          fromAddress,
        });
        candidates.push(buildCrossChainRoute(source, dest, quote));
      } catch {
        // LI.FI failure for this leg — skip this destination.
        // Celo-only results (already in candidates) still stand.
      }
    }
  }

  // Filter by policy; pick highest netGainBps among passing routes.
  const passing = candidates.filter((r) => {
    const verdict = evaluateRouteAgainstPolicy(r, policy);
    return verdict.pass;
  });

  if (passing.length === 0) return null;

  return passing.reduce((best, r) => (r.net_gain_bps > best.net_gain_bps ? r : best));
}
