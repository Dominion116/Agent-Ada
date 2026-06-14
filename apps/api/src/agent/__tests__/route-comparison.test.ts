import { describe, it, expect, vi } from "vitest";
import {
  computeRouteCostBps,
  computePaybackDays,
  computeNetGainBps,
  evaluateRouteAgainstPolicy,
  findBestRoute,
} from "../route-comparison.js";
import type { YieldData, Route, Policy } from "@ada/shared";
import { USDC_ADDRESSES, type LifiQuoter, type LifiQuoteResult } from "../lifi-client.js";
import { CELO_ASSETS } from "../../onchain/celo-client.js";

// ── Fixtures ──────────────────────────────────────────────────

const BASE_POLICY: Policy = {
  id: "00000000-0000-0000-0000-000000000001",
  wallet_address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  version: 1,
  min_net_gain_bps: 50,
  max_route_cost_bps: 150,
  cooldown_hours: 24,
  allowed_chains: ["celo", "base", "polygon", "arbitrum", "optimism"],
  allowed_venues: ["moola", "aave-v3"],
  kill_switch: false,
  created_at: new Date().toISOString(),
};

const CELO_MOOLA_USDC: YieldData = {
  chain: "celo",
  venue: "moola",
  asset: "USDC",
  supply_rate_bps: 480,
  utilisation_bps: 7200,
  last_updated: new Date().toISOString(),
};

const BASE_AAVE_USDC: YieldData = {
  chain: "base",
  venue: "aave-v3",
  asset: "USDC",
  supply_rate_bps: 620,
  utilisation_bps: 8100,
  last_updated: new Date().toISOString(),
};

const POLYGON_AAVE_USDC: YieldData = {
  chain: "polygon",
  venue: "aave-v3",
  asset: "USDC",
  supply_rate_bps: 390, // worse than source
  utilisation_bps: 5500,
  last_updated: new Date().toISOString(),
};

const FROM_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as const;
const PRINCIPAL = 1_000_000_000n; // 1000 USDC (6 dec)

function makeQuote(fromAmount: bigint, toAmount: bigint): LifiQuoteResult {
  return {
    fromAmount,
    toAmount,
    toAmountMin: toAmount,
    feeCosts: [],
    gasCostUsd: 0.5,
    estimatedSeconds: 300,
    rawRoute: { id: "test-route" },
  };
}

function makeQuoter(
  fromAmount: bigint,
  toAmount: bigint,
): LifiQuoter {
  return { getQuote: vi.fn().mockResolvedValue(makeQuote(fromAmount, toAmount)) };
}

function makeFailingQuoter(): LifiQuoter {
  return { getQuote: vi.fn().mockRejectedValue(new Error("LI.FI unavailable")) };
}

// ── Math tests ────────────────────────────────────────────────

describe("computeRouteCostBps", () => {
  it("returns 0 when amountIn equals amountOut (no bridge cost)", () => {
    expect(computeRouteCostBps(1_000_000n, 1_000_000n)).toBe(0);
  });

  it("returns 0 when amountIn is 0", () => {
    expect(computeRouteCostBps(0n, 0n)).toBe(0);
  });

  it("calculates 50 bps cost correctly", () => {
    // 1_000_000 in, 995_000 out → 5000/1_000_000 * 10000 = 50 bps
    expect(computeRouteCostBps(1_000_000n, 995_000n)).toBe(50);
  });

  it("calculates 150 bps cost correctly", () => {
    expect(computeRouteCostBps(1_000_000n, 985_000n)).toBe(150);
  });

  it("treats amountOut > amountIn as zero cost (no negative costs)", () => {
    expect(computeRouteCostBps(1_000_000n, 1_010_000n)).toBe(0);
  });

  it("normalizes a cUSD (18 dec) input against a USDC (6 dec) output", () => {
    // 1 cUSD in, 0.9995 USDC out → normalized to 18 dec = 0.9995e18 → 5 bps cost
    expect(computeRouteCostBps(10n ** 18n, 999_500n, 18, 6)).toBe(5);
  });

  it("normalizes a USDC (6 dec) input against a cUSD (18 dec) output", () => {
    // 1 USDC in, 0.9995 cUSD out → normalized to 6 dec = 0.9995e6 → 5 bps cost
    expect(computeRouteCostBps(1_000_000n, 999_500n * 10n ** 12n, 6, 18)).toBe(5);
  });
});

describe("computePaybackDays", () => {
  it("returns Infinity when gainDiffBps is zero", () => {
    expect(computePaybackDays(100, 0)).toBe(Infinity);
  });

  it("returns Infinity when gainDiffBps is negative", () => {
    expect(computePaybackDays(100, -50)).toBe(Infinity);
  });

  it("computes payback correctly: cost=100bps, gain=200bps → 182.5 days", () => {
    expect(computePaybackDays(100, 200)).toBeCloseTo(182.5, 1);
  });

  it("computes payback correctly: cost=50bps, gain=100bps → 182.5 days", () => {
    expect(computePaybackDays(50, 100)).toBeCloseTo(182.5, 1);
  });

  it("returns 0 days when routeCostBps is 0", () => {
    expect(computePaybackDays(0, 200)).toBe(0);
  });
});

describe("computeNetGainBps", () => {
  it("returns positive gain when destination is better", () => {
    expect(computeNetGainBps(480, 620)).toBe(140);
  });

  it("returns zero when rates are equal", () => {
    expect(computeNetGainBps(500, 500)).toBe(0);
  });

  it("returns negative when destination is worse", () => {
    expect(computeNetGainBps(620, 480)).toBe(-140);
  });
});

// ── Policy evaluation tests ───────────────────────────────────

describe("evaluateRouteAgainstPolicy", () => {
  function makeRoute(overrides: Partial<Route> = {}): Route {
    return {
      source_chain: "celo",
      source_venue: "moola",
      dest_chain: "base",
      dest_venue: "aave-v3",
      asset: "USDC",
      amount_in: "1000000000",
      amount_out: "995000000",
      route_cost_bps: 50,
      net_gain_bps: 140,
      payback_days: 13, // (50/140)*365 ≈ 13 days — safely under the 30-day default
      estimated_time_seconds: 300,
      lifi_route: null,
      ...overrides,
    };
  }

  it("passes a route that satisfies all policy constraints", () => {
    const result = evaluateRouteAgainstPolicy(makeRoute(), BASE_POLICY);
    expect(result.pass).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("rejects when net_gain_bps is below minimum", () => {
    const route = makeRoute({ net_gain_bps: 30 });
    const result = evaluateRouteAgainstPolicy(route, BASE_POLICY);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/net_gain_bps/);
  });

  it("rejects when route_cost_bps exceeds maximum", () => {
    const route = makeRoute({ route_cost_bps: 200 });
    const result = evaluateRouteAgainstPolicy(route, BASE_POLICY);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/route_cost_bps/);
  });

  it("rejects when payback_days exceeds maximum", () => {
    const route = makeRoute({ payback_days: 31 });
    const result = evaluateRouteAgainstPolicy(route, BASE_POLICY, 30);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/payback_days/);
  });

  it("rejects when destination chain is not in allowed_chains", () => {
    const policy = { ...BASE_POLICY, allowed_chains: ["celo" as const] };
    const route = makeRoute({ dest_chain: "base" });
    const result = evaluateRouteAgainstPolicy(route, policy);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/chain/);
  });

  it("rejects when destination venue is not in allowed_venues", () => {
    const policy = { ...BASE_POLICY, allowed_venues: ["moola" as const] };
    const result = evaluateRouteAgainstPolicy(makeRoute(), policy);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/venue/);
  });

  it("caps payback check at SYSTEM_MAX_PAYBACK_DAYS (90) even with permissive policy", () => {
    const route = makeRoute({ payback_days: 91 });
    // Supply a very large maxPaybackDays — system cap should still reject.
    const result = evaluateRouteAgainstPolicy(route, BASE_POLICY, 365);
    expect(result.pass).toBe(false);
  });

  it("passes a route right at the policy boundary", () => {
    const route = makeRoute({
      net_gain_bps: 50,       // exactly min
      route_cost_bps: 150,    // exactly max
      payback_days: 30,       // exactly max
    });
    const result = evaluateRouteAgainstPolicy(route, BASE_POLICY, 30);
    expect(result.pass).toBe(true);
  });
});

// ── findBestRoute tests ───────────────────────────────────────

describe("findBestRoute", () => {
  it("returns the best passing cross-chain route", async () => {
    // 1000 USDC in, 995 USDC out → 50 bps cost; net gain = 140 bps → payback ~130d
    // Policy allows 30 days max payback → this should FAIL the payback check.
    // Let's use 99.5% of amount out → 5 bps cost → payback = (5/140)*365 ≈ 13 days → PASS
    const quoter = makeQuoter(PRINCIPAL, (PRINCIPAL * 9995n) / 10000n);
    const route = await findBestRoute({
      lifi: quoter,
      source: CELO_MOOLA_USDC,
      allYields: [CELO_MOOLA_USDC, BASE_AAVE_USDC],
      policy: BASE_POLICY,
      amountIn: PRINCIPAL,
      fromAddress: FROM_ADDRESS,
    });

    expect(route).not.toBeNull();
    expect(route?.dest_chain).toBe("base");
    expect(route?.dest_venue).toBe("aave-v3");
  });

  it("returns null when all destinations are worse than source", async () => {
    const quoter = makeQuoter(PRINCIPAL, PRINCIPAL);
    const route = await findBestRoute({
      lifi: quoter,
      source: BASE_AAVE_USDC, // 620 bps — best yield
      allYields: [CELO_MOOLA_USDC, BASE_AAVE_USDC, POLYGON_AAVE_USDC],
      policy: BASE_POLICY,
      amountIn: PRINCIPAL,
      fromAddress: FROM_ADDRESS,
    });

    // None are better than BASE (620 bps) — all net_gain_bps will be negative or zero.
    expect(route).toBeNull();
  });

  it("returns null when no destination passes policy filters", async () => {
    // Cost = 200 bps — over policy max of 150.
    const quoter = makeQuoter(PRINCIPAL, (PRINCIPAL * 9800n) / 10000n);
    const route = await findBestRoute({
      lifi: quoter,
      source: CELO_MOOLA_USDC,
      allYields: [CELO_MOOLA_USDC, BASE_AAVE_USDC],
      policy: BASE_POLICY,
      amountIn: PRINCIPAL,
      fromAddress: FROM_ADDRESS,
    });

    expect(route).toBeNull();
  });

  it("falls back to Celo-only results when LI.FI fails", async () => {
    // Add a second Celo venue with higher rate (hypothetical).
    const CELO_AAVE_USDC: YieldData = {
      chain: "celo",
      venue: "aave-v3",
      asset: "USDC",
      supply_rate_bps: 600,
      utilisation_bps: 8000,
      last_updated: new Date().toISOString(),
    };

    const route = await findBestRoute({
      lifi: makeFailingQuoter(),
      source: CELO_MOOLA_USDC,
      allYields: [CELO_MOOLA_USDC, CELO_AAVE_USDC],
      policy: { ...BASE_POLICY, allowed_venues: ["moola", "aave-v3"] },
      amountIn: PRINCIPAL,
      fromAddress: FROM_ADDRESS,
    });

    // Celo-only route: zero cost, net gain = 120 bps → passes policy.
    expect(route).not.toBeNull();
    expect(route?.dest_chain).toBe("celo");
    expect(route?.route_cost_bps).toBe(0);
    expect(route?.payback_days).toBe(0);
  });

  it("bridges a cUSD source to a USDC destination cross-chain", async () => {
    const CELO_MOOLA_CUSD: YieldData = {
      ...CELO_MOOLA_USDC,
      asset: "cUSD",
    };
    // 1 cUSD (18 dec) in, 0.9995 USDC (6 dec) out → 5 bps cost.
    const cusdAmountIn = 10n ** 18n;
    const quoter = makeQuoter(cusdAmountIn, 999_500n);

    const route = await findBestRoute({
      lifi: quoter,
      source: CELO_MOOLA_CUSD,
      allYields: [CELO_MOOLA_CUSD, BASE_AAVE_USDC],
      policy: BASE_POLICY,
      amountIn: cusdAmountIn,
      fromAddress: FROM_ADDRESS,
    });

    expect(route).not.toBeNull();
    expect(route?.dest_chain).toBe("base");
    expect(route?.dest_venue).toBe("aave-v3");
    expect(route?.asset).toBe("cUSD");
    expect(route?.route_cost_bps).toBe(5);
    expect(quoter.getQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        fromTokenAddress: CELO_ASSETS.cUSD,
        toTokenAddress: USDC_ADDRESSES.base,
      }),
    );
  });

  it("picks the highest net_gain_bps among multiple passing routes", async () => {
    const ARB_AAVE_USDC: YieldData = {
      chain: "arbitrum",
      venue: "aave-v3",
      asset: "USDC",
      supply_rate_bps: 700, // higher than Base (620)
      utilisation_bps: 8500,
      last_updated: new Date().toISOString(),
    };

    // Both routes cheap: 5 bps cost each.
    const quoter = makeQuoter(PRINCIPAL, (PRINCIPAL * 9995n) / 10000n);

    const route = await findBestRoute({
      lifi: quoter,
      source: CELO_MOOLA_USDC,
      allYields: [CELO_MOOLA_USDC, BASE_AAVE_USDC, ARB_AAVE_USDC],
      policy: BASE_POLICY,
      amountIn: PRINCIPAL,
      fromAddress: FROM_ADDRESS,
    });

    expect(route?.dest_chain).toBe("arbitrum");
    expect(route?.net_gain_bps).toBe(220); // 700 - 480
  });

  it("returns null when there are no destinations in the yield list", async () => {
    const route = await findBestRoute({
      lifi: makeQuoter(PRINCIPAL, PRINCIPAL),
      source: CELO_MOOLA_USDC,
      allYields: [CELO_MOOLA_USDC], // only source itself
      policy: BASE_POLICY,
      amountIn: PRINCIPAL,
      fromAddress: FROM_ADDRESS,
    });
    expect(route).toBeNull();
  });
});
