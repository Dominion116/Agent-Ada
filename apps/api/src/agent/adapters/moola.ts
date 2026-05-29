import type { YieldData } from "@ada/shared";
import { LENDING_POOL_V2_ABI, DATA_PROVIDER_V2_ABI } from "../abis.js";

// ── Minimal client interface (injected; easy to mock in tests) ─
export interface ReadContractClient {
  readContract(args: {
    address: `0x${string}`;
    abi: readonly object[];
    functionName: string;
    args: readonly unknown[];
  }): Promise<unknown>;
}

// ── Moola Market contract addresses on Celo mainnet ───────────
// Source: https://github.com/moolamarket/moola-v2
const MOOLA_LENDING_POOL = "0x970b12522CA9b4054807a2c5B736149a5BE6f670" as const;
const MOOLA_DATA_PROVIDER = "0x43d067ed784D9DD2ffEda73775e2CC4c560103A1" as const;

// ── Supported assets on Celo ─────────────────────────────────
const ASSETS = [
  {
    asset: "0x765DE816845861e75A25fCA122bb6898B8B1282a" as const, // cUSD
    symbol: "cUSD" as const,
  },
  {
    asset: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as const, // USDC (Wormhole)
    symbol: "USDC" as const,
  },
] satisfies { asset: `0x${string}`; symbol: "cUSD" | "USDC" }[];

const RAY = 10n ** 27n;
const BPS = 10_000n;

function rayToBps(ray: bigint): number {
  return Number((ray * BPS) / RAY);
}

function utilisationBps(available: bigint, stableDebt: bigint, variableDebt: bigint): number {
  const totalDebt = stableDebt + variableDebt;
  const total = available + totalDebt;
  if (total === 0n) return 0;
  return Number((totalDebt * BPS) / total);
}

export class MoolaAdapter {
  constructor(private readonly client: ReadContractClient) {}

  async getYields(): Promise<YieldData[]> {
    const results = await Promise.allSettled(
      ASSETS.map((a) => this.fetchAssetYield(a.asset, a.symbol)),
    );
    return results
      .filter((r): r is PromiseFulfilledResult<YieldData> => r.status === "fulfilled")
      .map((r) => r.value);
  }

  private async fetchAssetYield(
    asset: `0x${string}`,
    symbol: "cUSD" | "USDC",
  ): Promise<YieldData> {
    const [poolRaw, providerRaw] = await Promise.all([
      this.client.readContract({
        address: MOOLA_LENDING_POOL,
        abi: LENDING_POOL_V2_ABI,
        functionName: "getReserveData",
        args: [asset],
      }),
      this.client.readContract({
        address: MOOLA_DATA_PROVIDER,
        abi: DATA_PROVIDER_V2_ABI,
        functionName: "getReserveData",
        args: [asset],
      }),
    ]);

    // LendingPool returns a named struct — access currentLiquidityRate directly.
    const pool = poolRaw as { currentLiquidityRate: bigint };

    // DataProvider returns a positional tuple — destructure by index.
    // [availableLiquidity, totalStableDebt, totalVariableDebt, liquidityRate, ...]
    const provider = providerRaw as readonly bigint[];
    const availableLiquidity = provider[0] ?? 0n;
    const totalStableDebt = provider[1] ?? 0n;
    const totalVariableDebt = provider[2] ?? 0n;

    return {
      chain: "celo",
      venue: "moola",
      asset: symbol,
      supply_rate_bps: rayToBps(pool.currentLiquidityRate),
      utilisation_bps: utilisationBps(availableLiquidity, totalStableDebt, totalVariableDebt),
      last_updated: new Date().toISOString(),
    };
  }
}
