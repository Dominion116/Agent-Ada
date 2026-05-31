import type { Policy, Route } from "@ada/shared";
import { evaluateRouteAgainstPolicy } from "./route-comparison.js";

// ── Types ─────────────────────────────────────────────────────

export interface PolicyVerdict {
  pass: boolean;
  reason: string | null;
  policy_version: number;
  checked_at: string;
}

/** Minimal run shape the engine needs — avoids coupling to the full Run type. */
export interface LastRunInfo {
  completed_at: string | null;
}

export interface EvaluatePolicyParams {
  route: Route;
  policy: Policy;
  /** Most recent completed or dry-run run for this wallet, or null if none. */
  lastRun: LastRunInfo | null;
  /** Injectable for deterministic unit tests. Defaults to Date.now(). */
  now?: Date;
}

// ── Guards ────────────────────────────────────────────────────

function checkKillSwitch(policy: Policy): string | null {
  return policy.kill_switch ? "kill switch is active" : null;
}

function checkCooldown(policy: Policy, lastRun: LastRunInfo | null, now: Date): string | null {
  if (policy.cooldown_hours === 0) return null;
  if (!lastRun?.completed_at) return null;

  const lastRunTime = new Date(lastRun.completed_at).getTime();
  if (isNaN(lastRunTime)) return null;

  const cooldownMs = policy.cooldown_hours * 60 * 60 * 1000;
  const nextAllowedAt = new Date(lastRunTime + cooldownMs);

  if (now.getTime() < nextAllowedAt.getTime()) {
    return `cooldown active — next run allowed at ${nextAllowedAt.toISOString()}`;
  }
  return null;
}

// ── Main evaluator ────────────────────────────────────────────

/**
 * Authoritative policy gate called immediately before any execution.
 *
 * Guards are checked in strict priority order so the first failing
 * guard is the reported reason — no silent compound failures.
 *
 * 1. kill_switch         — hard stop, no exceptions
 * 2. cooldown            — time since last run
 * 3. net_gain_bps        — annual yield improvement threshold
 * 4. route_cost_bps      — max acceptable one-time bridge cost
 * 5. payback_days        — max days to recoup bridge cost (default 30)
 * 6. allowed_chains      — destination chain whitelist
 * 7. allowed_venues      — destination venue whitelist
 */
export function evaluatePolicy(params: EvaluatePolicyParams): PolicyVerdict {
  const { route, policy, lastRun, now = new Date() } = params;

  const checked_at = now.toISOString();

  const verdict = (reason: string | null): PolicyVerdict => ({
    pass: reason === null,
    reason,
    policy_version: policy.version,
    checked_at,
  });

  // Guard 1 — kill switch
  const killReason = checkKillSwitch(policy);
  if (killReason) return verdict(killReason);

  // Guard 2 — cooldown
  const cooldownReason = checkCooldown(policy, lastRun, now);
  if (cooldownReason) return verdict(cooldownReason);

  // Guards 3-7 — route-level (delegates to route-comparison; no duplication of math)
  const routeVerdict = evaluateRouteAgainstPolicy(route, policy);
  return verdict(routeVerdict.reason);
}
