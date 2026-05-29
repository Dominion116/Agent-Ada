import { describe, it, expect, vi } from "vitest";
import { MoolaAdapter, type ReadContractClient } from "../adapters/moola.js";

// ── Mock client builder ───────────────────────────────────────
// Per-asset: two calls each — [LendingPool, DataProvider]
function makeMockClient(
  poolData: { currentLiquidityRate: bigint },
  providerTuple: bigint[], // [availableLiquidity, totalStableDebt, totalVariableDebt, ...]
): ReadContractClient {
  let callIndex = 0;
  return {
    readContract: vi.fn().mockImplementation(() => {
      const isPool = callIndex % 2 === 0;
      callIndex++;
      return Promise.resolve(isPool ? poolData : providerTuple);
    }),
  };
}

function makeFailingClient(failOnCall: number): ReadContractClient {
  let callIndex = 0;
  return {
    readContract: vi.fn().mockImplementation(() => {
      const current = callIndex++;
      if (current === failOnCall) return Promise.reject(new Error("revert"));
      if (current % 2 === 0) return Promise.resolve({ currentLiquidityRate: 4n * 10n ** 25n });
      return Promise.resolve([60n * 10n ** 18n, 0n, 40n * 10n ** 18n]);
    }),
  };
}

const RAY = 10n ** 27n;

describe("MoolaAdapter", () => {
  it("converts RAY-denominated rate to BPS correctly", async () => {
    // 5% APR in RAY = 0.05 × 1e27 = 5e25
    const client = makeMockClient(
      { currentLiquidityRate: 5n * 10n ** 25n },
      [30n * RAY, 0n, 70n * RAY],
    );
    const yields = await new MoolaAdapter(client).getYields();
    // 5% = 500 bps
    expect(yields[0]?.supply_rate_bps).toBe(500);
  });

  it("computes utilisation BPS from liquidity and debt", async () => {
    // available=30, variableDebt=70 → utilisation = 70/100 = 70% = 7000 bps
    const unit = 10n ** 18n;
    const client = makeMockClient(
      { currentLiquidityRate: 4n * 10n ** 25n },
      [30n * unit, 0n, 70n * unit],
    );
    const yields = await new MoolaAdapter(client).getYields();
    expect(yields[0]?.utilisation_bps).toBe(7000);
  });

  it("returns utilisation 0 when pool is empty", async () => {
    const client = makeMockClient({ currentLiquidityRate: 0n }, [0n, 0n, 0n]);
    const yields = await new MoolaAdapter(client).getYields();
    yields.forEach((y) => expect(y.utilisation_bps).toBe(0));
  });

  it("returns partial results when one asset call fails", async () => {
    // Fail on call index 2 (second asset's LendingPool call)
    const client = makeFailingClient(2);
    const yields = await new MoolaAdapter(client).getYields();
    expect(yields.length).toBeGreaterThanOrEqual(1);
    expect(yields.length).toBeLessThan(2);
  });

  it("tags results with correct chain and venue", async () => {
    const client = makeMockClient(
      { currentLiquidityRate: 3n * 10n ** 25n },
      [50n, 0n, 50n],
    );
    const yields = await new MoolaAdapter(client).getYields();
    yields.forEach((y) => {
      expect(y.chain).toBe("celo");
      expect(y.venue).toBe("moola");
    });
  });

  it("returns both cUSD and USDC entries", async () => {
    const client = makeMockClient(
      { currentLiquidityRate: 4n * 10n ** 25n },
      [60n, 0n, 40n],
    );
    const yields = await new MoolaAdapter(client).getYields();
    expect(yields).toHaveLength(2);
    const assets = yields.map((y) => y.asset);
    expect(assets).toContain("cUSD");
    expect(assets).toContain("USDC");
  });
});
