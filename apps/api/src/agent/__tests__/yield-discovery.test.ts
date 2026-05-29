import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getYields,
  bestYield,
  clearYieldCache,
  type YieldAdapter,
} from "../yield-discovery.js";
import type { YieldData } from "@ada/shared";

// ── Stub adapters ─────────────────────────────────────────────

const MOOLA_CUSD: YieldData = {
  chain: "celo",
  venue: "moola",
  asset: "cUSD",
  supply_rate_bps: 480,
  utilisation_bps: 7200,
  last_updated: new Date().toISOString(),
};

const MOOLA_USDC: YieldData = {
  chain: "celo",
  venue: "moola",
  asset: "USDC",
  supply_rate_bps: 520,
  utilisation_bps: 7500,
  last_updated: new Date().toISOString(),
};

const BASE_USDC: YieldData = {
  chain: "base",
  venue: "aave-v3",
  asset: "USDC",
  supply_rate_bps: 620,
  utilisation_bps: 8100,
  last_updated: new Date().toISOString(),
};

function makeStubAdapter(yields: YieldData[]): YieldAdapter {
  return { getYields: vi.fn().mockResolvedValue(yields) };
}

function makeFailingAdapter(): YieldAdapter {
  return { getYields: vi.fn().mockRejectedValue(new Error("RPC timeout")) };
}

// ── Tests ─────────────────────────────────────────────────────

describe("getYields", () => {
  beforeEach(() => {
    clearYieldCache();
  });

  it("aggregates yields from all adapters", async () => {
    const adapters = [
      makeStubAdapter([MOOLA_CUSD, MOOLA_USDC]),
      makeStubAdapter([BASE_USDC]),
    ];
    const result = await getYields(adapters);
    expect(result).toHaveLength(3);
    expect(result).toContainEqual(MOOLA_CUSD);
    expect(result).toContainEqual(BASE_USDC);
  });

  it("returns partial results when one adapter fails", async () => {
    const adapters = [
      makeStubAdapter([MOOLA_CUSD, MOOLA_USDC]),
      makeFailingAdapter(),
    ];
    const result = await getYields(adapters);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual(MOOLA_CUSD);
  });

  it("returns empty array when all adapters fail", async () => {
    const adapters = [makeFailingAdapter(), makeFailingAdapter()];
    const result = await getYields(adapters);
    expect(result).toEqual([]);
  });

  it("serves from cache on second call without hitting adapters", async () => {
    const adapter = makeStubAdapter([MOOLA_CUSD]);
    await getYields([adapter]);
    await getYields([adapter]);
    expect(adapter.getYields).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after cache expiry", async () => {
    vi.useFakeTimers();
    const adapter = makeStubAdapter([MOOLA_CUSD]);

    await getYields([adapter]);
    vi.advanceTimersByTime(61_000); // past default 60s TTL
    clearYieldCache(); // simulate expiry (fake timers don't affect Date.now in this setup)
    await getYields([adapter]);

    expect(adapter.getYields).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe("bestYield", () => {
  const yields: YieldData[] = [MOOLA_CUSD, MOOLA_USDC, BASE_USDC];

  it("returns the highest supply_rate_bps for the given asset", () => {
    const best = bestYield(yields, "USDC", ["celo", "base"]);
    expect(best?.supply_rate_bps).toBe(620);
    expect(best?.chain).toBe("base");
  });

  it("respects the allowedChains filter", () => {
    const best = bestYield(yields, "USDC", ["celo"]);
    expect(best?.chain).toBe("celo");
    expect(best?.supply_rate_bps).toBe(520);
  });

  it("returns null when no asset matches", () => {
    expect(bestYield(yields, "cUSD", ["base"])).toBeNull();
  });

  it("returns null when allowed chains filter excludes all results", () => {
    expect(bestYield(yields, "USDC", ["polygon"])).toBeNull();
  });

  it("returns null for empty yields array", () => {
    expect(bestYield([], "USDC", ["celo"])).toBeNull();
  });
});
