import {
  createPublicClient,
  createWalletClient,
  http,
  parseGwei,
  type PublicClient,
  type WalletClient,
  type Transport,
  type Chain,
} from "viem";
import { celo } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import type { Asset } from "@ada/shared";
import { ERC20_ABI } from "../agent/abis.js";

// ── Asset addresses on Celo mainnet ──────────────────────────
export const CELO_ASSETS: Record<Asset, `0x${string}`> = {
  cUSD: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
  USDC: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C", // Wormhole-bridged USDC
};

// ── Default gas parameters for Celo EIP-1559 ─────────────────
// Never use estimateGas in production; these are conservative bounds.
export const GAS_PARAMS = {
  maxFeePerGas: parseGwei("5"),          // 5 gwei ceiling
  maxPriorityFeePerGas: parseGwei("2"),  // 2 gwei tip
} as const;

export const GAS_LIMITS = {
  ERC20_APPROVE: 60_000n,
  MOOLA_DEPOSIT: 350_000n,
  MOOLA_WITHDRAW: 250_000n,
} as const;

// ── Singleton clients ─────────────────────────────────────────

let _publicClient: PublicClient<Transport, Chain> | null = null;
let _walletClient: WalletClient<Transport, Chain> | null = null;

function rpcUrl(): string {
  return process.env["CELO_RPC_URL"] ?? "https://forno.celo.org";
}

/**
 * Returns the singleton Viem public client for Celo.
 * Used for all read-only RPC calls.
 */
export function getCeloPublicClient(): PublicClient<Transport, Chain> {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain: celo,
      transport: http(rpcUrl()),
    }) as PublicClient<Transport, Chain>;
  }
  return _publicClient;
}

/**
 * Returns the singleton Viem wallet client for the agent's operational wallet.
 * Never call this in browser-side code — AGENT_PRIVATE_KEY is server-only.
 */
export function getCeloWalletClient(): WalletClient<Transport, Chain> {
  if (!_walletClient) {
    const privateKey = process.env["AGENT_PRIVATE_KEY"];
    if (!privateKey) throw new Error("AGENT_PRIVATE_KEY must be set");

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    _walletClient = createWalletClient({
      account,
      chain: celo,
      transport: http(rpcUrl()),
    }) as WalletClient<Transport, Chain>;
  }
  return _walletClient;
}

// ── Reset helpers (test use only) ─────────────────────────────
export function _resetCeloClients(): void {
  _publicClient = null;
  _walletClient = null;
}

// ── Balance reader ────────────────────────────────────────────

export interface StablecoinBalance {
  asset: Asset;
  raw: bigint;      // atomic units (18 decimals for cUSD, 6 for USDC)
  decimals: number;
  formatted: string; // human-readable, e.g. "1234.56"
}

const ASSET_DECIMALS: Record<Asset, number> = {
  cUSD: 18,
  USDC: 6,
};

/**
 * Reads the ERC-20 balance of `walletAddress` for the given asset on Celo.
 */
export async function getStablecoinBalance(
  walletAddress: `0x${string}`,
  asset: Asset,
  client: Pick<PublicClient, "readContract"> = getCeloPublicClient(),
): Promise<StablecoinBalance> {
  const tokenAddress = CELO_ASSETS[asset];
  const decimals = ASSET_DECIMALS[asset];

  const raw = await client.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [walletAddress],
  });

  return {
    asset,
    raw,
    decimals,
    formatted: formatUnits(raw, decimals),
  };
}

/**
 * Returns balances for all supported stablecoins on Celo for a given wallet.
 * Each asset call fails independently — a bad token doesn't suppress others.
 */
export async function getAllStablecoinBalances(
  walletAddress: `0x${string}`,
  client?: Pick<PublicClient, "readContract">,
): Promise<StablecoinBalance[]> {
  const assets: Asset[] = ["cUSD", "USDC"];
  const results = await Promise.allSettled(
    assets.map((a) => getStablecoinBalance(walletAddress, a, client)),
  );
  return results
    .filter((r): r is PromiseFulfilledResult<StablecoinBalance> => r.status === "fulfilled")
    .map((r) => r.value);
}

// ── Formatting helper ─────────────────────────────────────────

function formatUnits(value: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const remainder = value % divisor;
  if (remainder === 0n) return whole.toString();
  const frac = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${frac}`;
}
