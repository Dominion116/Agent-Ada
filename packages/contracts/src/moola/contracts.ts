import { createPublicClient, http, type PublicClient } from "viem";
import { celo } from "viem/chains";
import { LENDING_POOL_ABI, DATA_PROVIDER_ABI, ATOKEN_ABI } from "./abis.js";

// ── Contract addresses on Celo mainnet ────────────────────────

export const MOOLA_ADDRESSES = {
  lendingPool: "0x970b12522CA9b4054807a2c5B736149a5BE6f670" as const,
  dataProvider: "0x43d067ed784D9DD2ffEda73775e2CC4c560103A1" as const,
  addressProvider: "0xD1088091A174d33412a968Fa34Cb67131188B332" as const,
} satisfies Record<string, `0x${string}`>;

export const CELO_ASSET_ADDRESSES = {
  cUSD: "0x765DE816845861e75A25fCA122bb6898B8B1282a" as const,
  USDC: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as const,
} satisfies Record<string, `0x${string}`>;

const RAY = 10n ** 27n;
const BPS = 10_000n;

// ── Typed query helpers ───────────────────────────────────────

export interface MoolaReserveData {
  supplyRateBps: number;
  utilisationBps: number;
  aTokenAddress: `0x${string}`;
  lastUpdated: string;
}

export interface MoolaUserPosition {
  /** aToken balance in atomic units (equals underlying deposited + interest). */
  aTokenBalance: bigint;
  /** Whether this asset is enabled as collateral. */
  collateralEnabled: boolean;
}

/**
 * Returns supply APR, utilisation, and aToken address for a Moola reserve.
 */
export async function getMoolaReserveData(
  asset: `0x${string}`,
  client: PublicClient = defaultClient(),
): Promise<MoolaReserveData> {
  const [poolRaw, providerRaw] = await Promise.all([
    client.readContract({
      address: MOOLA_ADDRESSES.lendingPool,
      abi: LENDING_POOL_ABI,
      functionName: "getReserveData",
      args: [asset],
    }),
    client.readContract({
      address: MOOLA_ADDRESSES.dataProvider,
      abi: DATA_PROVIDER_ABI,
      functionName: "getReserveData",
      args: [asset],
    }),
  ]);

  const pool = poolRaw as { currentLiquidityRate: bigint; aTokenAddress: `0x${string}` };
  const provider = providerRaw as readonly bigint[];

  const available = provider[0] ?? 0n;
  const stableDebt = provider[1] ?? 0n;
  const variableDebt = provider[2] ?? 0n;
  const totalDebt = stableDebt + variableDebt;
  const total = available + totalDebt;

  return {
    supplyRateBps: Number((pool.currentLiquidityRate * BPS) / RAY),
    utilisationBps: total === 0n ? 0 : Number((totalDebt * BPS) / total),
    aTokenAddress: pool.aTokenAddress,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Returns the deposited position for a wallet on a given Moola reserve.
 * The aToken balance equals the underlying principal plus accrued interest.
 */
export async function getMoolaUserPosition(
  asset: `0x${string}`,
  wallet: `0x${string}`,
  client: PublicClient = defaultClient(),
): Promise<MoolaUserPosition> {
  const [tokenAddresses, userData] = await Promise.all([
    client.readContract({
      address: MOOLA_ADDRESSES.dataProvider,
      abi: DATA_PROVIDER_ABI,
      functionName: "getReserveTokensAddresses",
      args: [asset],
    }),
    client.readContract({
      address: MOOLA_ADDRESSES.dataProvider,
      abi: DATA_PROVIDER_ABI,
      functionName: "getUserReserveData",
      args: [asset, wallet],
    }),
  ]);

  const [aTokenAddress] = tokenAddresses as readonly [`0x${string}`, `0x${string}`, `0x${string}`];

  // currentATokenBalance is index 0 of the getUserReserveData tuple.
  const aTokenBalance = client.readContract({
    address: aTokenAddress,
    abi: ATOKEN_ABI,
    functionName: "balanceOf",
    args: [wallet],
  });

  const user = userData as readonly unknown[];
  const collateralEnabled = Boolean(user[8]);

  return {
    aTokenBalance: await aTokenBalance,
    collateralEnabled,
  };
}

// ── Singleton public client ───────────────────────────────────

let _client: PublicClient | null = null;

function defaultClient(): PublicClient {
  if (!_client) {
    _client = createPublicClient({
      chain: celo,
      transport: http(process.env["CELO_RPC_URL"] ?? "https://forno.celo.org"),
    }) as unknown as PublicClient;
  }
  return _client;
}
