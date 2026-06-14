import { createPublicClient, http } from "viem";
import { base, polygon, arbitrum, optimism } from "viem/chains";
import type { YieldData, Chain } from "@ada/shared";
import type { ReadContractClient } from "./moola.js";
import { POOL_V3_ABI, DATA_PROVIDER_V3_ABI } from "../abis.js";

// ── Chain configuration ───────────────────────────────────────
// Verify addresses at: https://docs.aave.com/developers/deployed-contracts/v3-mainnet
interface ChainConfig {
  chain: Chain;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  viemChain: any; // concrete viem chain objects have incompatible literal types
  rpcUrl: string;
  poolAddress: `0x${string}`;
  dataProviderAddress: `0x${string}`;
  usdcAddress: `0x${string}`;
}

const CHAIN_CONFIGS: ChainConfig[] = [
  {
    chain: "base",
    viemChain: base,
    rpcUrl: process.env["BASE_RPC_URL"] ?? "https://mainnet.base.org",
    poolAddress: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
    dataProviderAddress: "0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A",
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  {
    chain: "polygon",
    viemChain: polygon,
    rpcUrl: process.env["POLYGON_RPC_URL"] ?? "https://polygon-bor-rpc.publicnode.com",
    poolAddress: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    dataProviderAddress: "0x9441B65EE553F70df9C77d45d3283B6BC24F222d",
    usdcAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  },
  {
    chain: "arbitrum",
    viemChain: arbitrum,
    rpcUrl: process.env["ARBITRUM_RPC_URL"] ?? "https://arb1.arbitrum.io/rpc",
    poolAddress: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    dataProviderAddress: "0x243Aa95cAC2a25651eda86e80bEe66114413c43b",
    usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  },
  {
    chain: "optimism",
    viemChain: optimism,
    rpcUrl: process.env["OPTIMISM_RPC_URL"] ?? "https://mainnet.optimism.io",
    poolAddress: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    dataProviderAddress: "0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654",
    usdcAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  },
];

const RAY = 10n ** 27n;
const BPS = 10_000n;

function rayToBps(ray: bigint): number {
  return Number((ray * BPS) / RAY);
}

function utilisationBps(totalAToken: bigint, stableDebt: bigint, variableDebt: bigint): number {
  const totalDebt = stableDebt + variableDebt;
  if (totalAToken === 0n) return 0;
  return Number((totalDebt * BPS) / totalAToken);
}

export class AaveV3Adapter {
  private readonly clients: Map<Chain, ReadContractClient>;

  /** Pass injectedClients to override per-chain RPC clients (used in tests). */
  constructor(injectedClients?: Map<Chain, ReadContractClient>) {
    this.clients = injectedClients ?? new Map();
  }

  private getClient(cfg: ChainConfig): ReadContractClient {
    const existing = this.clients.get(cfg.chain);
    if (existing) return existing;

    const client = createPublicClient({
      chain: cfg.viemChain,
      transport: http(cfg.rpcUrl),
    }) as ReadContractClient;

    this.clients.set(cfg.chain, client);
    return client;
  }

  async getYields(): Promise<YieldData[]> {
    const results = await Promise.allSettled(
      CHAIN_CONFIGS.map((cfg) => this.fetchChainYield(cfg)),
    );
    return results
      .filter((r): r is PromiseFulfilledResult<YieldData> => r.status === "fulfilled")
      .map((r) => r.value);
  }

  private async fetchChainYield(cfg: ChainConfig): Promise<YieldData> {
    const client = this.getClient(cfg);

    const [poolRaw, providerRaw] = await Promise.all([
      client.readContract({
        address: cfg.poolAddress,
        abi: POOL_V3_ABI,
        functionName: "getReserveData",
        args: [cfg.usdcAddress],
      }),
      client.readContract({
        address: cfg.dataProviderAddress,
        abi: DATA_PROVIDER_V3_ABI,
        functionName: "getReserveData",
        args: [cfg.usdcAddress],
      }),
    ]);

    // Pool returns a named struct — access currentLiquidityRate directly.
    const pool = poolRaw as { currentLiquidityRate: bigint };

    // DataProvider returns a positional tuple.
    // [unbacked, accruedToTreasuryScaled, totalAToken, totalStableDebt, totalVariableDebt, ...]
    const provider = providerRaw as readonly bigint[];
    const totalAToken = provider[2] ?? 0n;
    const totalStableDebt = provider[3] ?? 0n;
    const totalVariableDebt = provider[4] ?? 0n;

    return {
      chain: cfg.chain,
      venue: "aave-v3",
      asset: "USDC",
      supply_rate_bps: rayToBps(pool.currentLiquidityRate),
      utilisation_bps: utilisationBps(totalAToken, totalStableDebt, totalVariableDebt),
      last_updated: new Date().toISOString(),
    };
  }
}
