import { createPublicClient, http } from "viem";
import { celo } from "viem/chains";
import type { YieldData } from "@ada/shared";
import { MoolaAdapter, type ReadContractClient } from "./adapters/moola.js";
import { AaveV3Adapter } from "./adapters/aave-v3.js";

// ── Adapter interface ─────────────────────────────────────────

export interface YieldAdapter {
  getYields(): Promise<YieldData[]>;
}

// ── Cache ─────────────────────────────────────────────────────

interface CacheEntry {
  data: YieldData[];
  expiresAt: number;
}

let _cache: CacheEntry | null = null;

function cacheTtlMs(): number {
  const envVal = process.env["YIELD_CACHE_TTL_SECONDS"];
  const seconds = envVal ? parseInt(envVal, 10) : 60;
  return (isNaN(seconds) ? 60 : seconds) * 1000;
}

function isCacheValid(): boolean {
  return _cache !== null && Date.now() < _cache.expiresAt;
}

export function clearYieldCache(): void {
  _cache = null;
}

// ── Singleton adapters ────────────────────────────────────────

let _adapters: YieldAdapter[] | null = null;

function defaultAdapters(): YieldAdapter[] {
  if (_adapters) return _adapters;

  const celoClient = createPublicClient({
    chain: celo,
    transport: http(process.env["CELO_RPC_URL"] ?? "https://forno.celo.org"),
  }) as ReadContractClient;

  _adapters = [new MoolaAdapter(celoClient), new AaveV3Adapter()];
  return _adapters;
}

// ── Public API ────────────────────────────────────────────────

/**
 * Returns cached yield data across all supported venues and chains.
 * Cache TTL is 60 s by default, overridden by YIELD_CACHE_TTL_SECONDS.
 *
 * Each adapter fails independently — a bad RPC for one chain will not
 * suppress results from the others.
 *
 * @param adapters Injectable for testing; uses default adapters in production.
 */
export async function getYields(
  adapters: YieldAdapter[] = defaultAdapters(),
): Promise<YieldData[]> {
  if (isCacheValid()) {
    return _cache!.data;
  }

  const results = await Promise.allSettled(adapters.map((a) => a.getYields()));

  const data = results
    .filter((r): r is PromiseFulfilledResult<YieldData[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);

  _cache = { data, expiresAt: Date.now() + cacheTtlMs() };
  return data;
}

/**
 * Returns the single best yield for a given asset across all venues,
 * constrained to the chains in the allowlist.
 */
export function bestYield(
  yields: YieldData[],
  asset: "cUSD" | "USDC",
  allowedChains: string[],
): YieldData | null {
  const candidates = yields.filter(
    (y) => y.asset === asset && allowedChains.includes(y.chain),
  );
  if (candidates.length === 0) return null;

  return candidates.reduce((best, y) =>
    y.supply_rate_bps > best.supply_rate_bps ? y : best,
  );
}
