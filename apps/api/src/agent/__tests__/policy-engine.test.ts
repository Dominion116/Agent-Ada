import { describe, it, expect } from "vitest";
import { evaluatePolicy } from "../policy-engine.js";
import type { Policy, Route } from "@ada/shared";

// ── Fixtures ──────────────────────────────────────────────────

const BASE_POLICY: Policy = {
  id: "00000000-0000-0000-0000-000000000001",
  wallet_address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  version: 3,
  min_net_gain_bps: 50,
  max_route_cost_bps: 150,
  cooldown_hours: 24,
  allowed_chains: ["celo", "base", "polygon", "arbitrum", "optimism"],
  allowed_venues: ["moola", "aave-v3"],
  kill_switch: false,
  created_at: "2026-05-01T00:00:00.000Z",
};

const GOOD_ROUTE: Route = {
  source_chain: "celo",
  source_venue: "moola",
  dest_chain: "base",
  dest_venue: "aave-v3",
  asset: "USDC",
  amount_in: "1000000000",
  amount_out: "999500000",
  route_cost_bps: 5,       // well under 150 max
  net_gain_bps: 140,       // well above 50 min
  payback_days: 13,        // well under 30 default
  estimated_time_seconds: 300,
  lifi_route: null,
};

// Fixed reference time for all cooldown tests
const NOW = new Date("2026-05-30T12:00:00.000Z");

// ── Passing case ──────────────────────────────────────────────

describe("evaluatePolicy — passing", () => {
  it("passes when all guards are satisfied", () => {
    const lastRun = { completed_at: "2026-05-29T00:00:00.000Z" }; // 36 h ago
    const v = evaluatePolicy({ route: GOOD_ROUTE, policy: BASE_POLICY, lastRun, now: NOW });

    expect(v.pass).toBe(true);
    expect(v.reason).toBeNull();
    expect(v.policy_version).toBe(3);
    expect(v.checked_at).toBe(NOW.toISOString());
  });

  it("passes when there is no prior run (first ever execution)", () => {
    const v = evaluatePolicy({ route: GOOD_ROUTE, policy: BASE_POLICY, lastRun: null, now: NOW });
    expect(v.pass).toBe(true);
  });

  it("passes when last run completed_at is null (run never finished)", () => {
    const v = evaluatePolicy({
      route: GOOD_ROUTE,
      policy: BASE_POLICY,
      lastRun: { completed_at: null },
      now: NOW,
    });
    expect(v.pass).toBe(true);
  });

  it("passes when cooldown_hours is 0 regardless of last run time", () => {
    const policy = { ...BASE_POLICY, cooldown_hours: 0 };
    const lastRun = { completed_at: NOW.toISOString() }; // just now
    const v = evaluatePolicy({ route: GOOD_ROUTE, policy, lastRun, now: NOW });
    expect(v.pass).toBe(true);
  });
});

// ── Guard 1: kill switch ──────────────────────────────────────

describe("evaluatePolicy — guard 1: kill_switch", () => {
  it("rejects immediately when kill switch is engaged", () => {
    const policy = { ...BASE_POLICY, kill_switch: true };
    const v = evaluatePolicy({ route: GOOD_ROUTE, policy, lastRun: null, now: NOW });

    expect(v.pass).toBe(false);
    expect(v.reason).toMatch(/kill switch/i);
  });

  it("kill switch takes priority over every other guard", () => {
    // Route would also fail on net_gain_bps, but kill switch fires first.
    const policy = { ...BASE_POLICY, kill_switch: true, min_net_gain_bps: 999 };
    const badRoute = { ...GOOD_ROUTE, net_gain_bps: 0 };
    const v = evaluatePolicy({ route: badRoute, policy, lastRun: null, now: NOW });

    expect(v.reason).toMatch(/kill switch/i);
  });
});

// ── Guard 2: cooldown ─────────────────────────────────────────

describe("evaluatePolicy — guard 2: cooldown", () => {
  it("rejects when last run completed less than cooldown_hours ago", () => {
    // Last run was 12 h ago; cooldown is 24 h → still in cooldown.
    const lastRun = { completed_at: "2026-05-30T00:00:00.000Z" }; // 12 h before NOW
    const v = evaluatePolicy({ route: GOOD_ROUTE, policy: BASE_POLICY, lastRun, now: NOW });

    expect(v.pass).toBe(false);
    expect(v.reason).toMatch(/cooldown/i);
  });

  it("passes when last run completed exactly at the cooldown boundary", () => {
    // Last run was exactly 24 h ago → cooldown just expired.
    const lastRun = { completed_at: "2026-05-29T12:00:00.000Z" };
    const v = evaluatePolicy({ route: GOOD_ROUTE, policy: BASE_POLICY, lastRun, now: NOW });
    expect(v.pass).toBe(true);
  });

  it("rejection message includes the next-allowed timestamp", () => {
    const lastRun = { completed_at: "2026-05-30T06:00:00.000Z" }; // 6 h ago
    const v = evaluatePolicy({ route: GOOD_ROUTE, policy: BASE_POLICY, lastRun, now: NOW });

    expect(v.reason).toMatch(/next run allowed at/i);
    expect(v.reason).toContain("2026-05-31T06:00:00.000Z");
  });

  it("cooldown takes priority over route-level guards", () => {
    const lastRun = { completed_at: "2026-05-30T06:00:00.000Z" }; // 6 h ago
    const badRoute = { ...GOOD_ROUTE, net_gain_bps: 0 }; // also fails guard 3
    const v = evaluatePolicy({ route: badRoute, policy: BASE_POLICY, lastRun, now: NOW });

    expect(v.reason).toMatch(/cooldown/i);
  });
});

// ── Guard 3: net_gain_bps ─────────────────────────────────────

describe("evaluatePolicy — guard 3: net_gain_bps", () => {
  it("rejects when net_gain_bps is below minimum", () => {
    const route = { ...GOOD_ROUTE, net_gain_bps: 40 }; // below min of 50
    const v = evaluatePolicy({ route, policy: BASE_POLICY, lastRun: null, now: NOW });

    expect(v.pass).toBe(false);
    expect(v.reason).toMatch(/net_gain_bps/i);
  });

  it("passes at exactly the minimum net_gain_bps", () => {
    const route = { ...GOOD_ROUTE, net_gain_bps: 50 };
    const v = evaluatePolicy({ route, policy: BASE_POLICY, lastRun: null, now: NOW });
    expect(v.pass).toBe(true);
  });
});

// ── Guard 4: route_cost_bps ───────────────────────────────────

describe("evaluatePolicy — guard 4: route_cost_bps", () => {
  it("rejects when route_cost_bps exceeds maximum", () => {
    const route = { ...GOOD_ROUTE, route_cost_bps: 200 }; // above max of 150
    const v = evaluatePolicy({ route, policy: BASE_POLICY, lastRun: null, now: NOW });

    expect(v.pass).toBe(false);
    expect(v.reason).toMatch(/route_cost_bps/i);
  });

  it("passes at exactly the maximum route_cost_bps", () => {
    const route = { ...GOOD_ROUTE, route_cost_bps: 150 };
    const v = evaluatePolicy({ route, policy: BASE_POLICY, lastRun: null, now: NOW });
    expect(v.pass).toBe(true);
  });
});

// ── Guard 5: payback_days ─────────────────────────────────────

describe("evaluatePolicy — guard 5: payback_days", () => {
  it("rejects when payback_days exceeds the default 30-day cap", () => {
    const route = { ...GOOD_ROUTE, payback_days: 45 };
    const v = evaluatePolicy({ route, policy: BASE_POLICY, lastRun: null, now: NOW });

    expect(v.pass).toBe(false);
    expect(v.reason).toMatch(/payback_days/i);
  });
});

// ── Guard 6: allowed_chains ───────────────────────────────────

describe("evaluatePolicy — guard 6: allowed_chains", () => {
  it("rejects when destination chain is not in allowed_chains", () => {
    const policy = { ...BASE_POLICY, allowed_chains: ["celo" as const] };
    const v = evaluatePolicy({ route: GOOD_ROUTE, policy, lastRun: null, now: NOW });

    expect(v.pass).toBe(false);
    expect(v.reason).toMatch(/chain/i);
  });
});

// ── Guard 7: allowed_venues ───────────────────────────────────

describe("evaluatePolicy — guard 7: allowed_venues", () => {
  it("rejects when destination venue is not in allowed_venues", () => {
    const policy = { ...BASE_POLICY, allowed_venues: ["moola" as const] };
    const v = evaluatePolicy({ route: GOOD_ROUTE, policy, lastRun: null, now: NOW });

    expect(v.pass).toBe(false);
    expect(v.reason).toMatch(/venue/i);
  });
});

// ── Priority ordering ─────────────────────────────────────────

describe("evaluatePolicy — guard priority order", () => {
  it("reports kill_switch before cooldown when both fail", () => {
    const policy = { ...BASE_POLICY, kill_switch: true };
    const lastRun = { completed_at: NOW.toISOString() }; // also in cooldown
    const v = evaluatePolicy({ route: GOOD_ROUTE, policy, lastRun, now: NOW });
    expect(v.reason).toMatch(/kill switch/i);
  });

  it("reports cooldown before net_gain when both fail", () => {
    const lastRun = { completed_at: NOW.toISOString() }; // in cooldown
    const route = { ...GOOD_ROUTE, net_gain_bps: 0 };    // also fails net_gain
    const v = evaluatePolicy({ route, policy: BASE_POLICY, lastRun, now: NOW });
    expect(v.reason).toMatch(/cooldown/i);
  });

  it("reports net_gain before route_cost when both route guards fail", () => {
    const route = { ...GOOD_ROUTE, net_gain_bps: 0, route_cost_bps: 999 };
    const v = evaluatePolicy({ route, policy: BASE_POLICY, lastRun: null, now: NOW });
    expect(v.reason).toMatch(/net_gain_bps/i);
  });
});
