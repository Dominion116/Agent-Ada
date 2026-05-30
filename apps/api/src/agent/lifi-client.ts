/**
 * Thin wrapper around the LI.FI SDK.
 *
 * The LifiQuoter interface is the only surface the route-comparison
 * service depends on — keeping it injectable so tests never hit the
 * real SDK or any network.
 */

import type { Chain } from "@ada/shared";

// ── Chain IDs ────────────────────────────────────────────────
export const CHAIN_IDS: Record<Chain, number> = {
  celo: 42220,
  base: 8453,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
};

// ── Token addresses by chain (USDC only — cUSD is Celo-native) ──
export const USDC_ADDRESSES: Partial<Record<Chain, `0x${string}`>> = {
  celo: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
};

// ── Interface ─────────────────────────────────────────────────

export interface LifiQuoteParams {
  fromChain: Chain;
  toChain: Chain;
  fromTokenAddress: `0x${string}`;
  toTokenAddress: `0x${string}`;
  fromAmount: bigint; // atomic units
  fromAddress: `0x${string}`;
}

export interface LifiQuoteResult {
  fromAmount: bigint;        // atomic units in
  toAmount: bigint;          // atomic units out (after all fees + slippage)
  toAmountMin: bigint;       // minimum out at configured slippage
  feeCosts: FeeCostItem[];
  gasCostUsd: number;        // total gas cost in USD
  estimatedSeconds: number;
  rawRoute: Record<string, unknown>; // stored verbatim for execution phase
}

export interface FeeCostItem {
  name: string;
  amountUsd: string;
}

export interface LifiQuoter {
  getQuote(params: LifiQuoteParams): Promise<LifiQuoteResult>;
}

// ── Real SDK implementation ───────────────────────────────────

let _sdkInitialised = false;

async function ensureSdkInit(): Promise<void> {
  if (_sdkInitialised) return;
  const { createConfig } = await import("@lifi/sdk");
  createConfig({ integrator: "agent-ada" });
  _sdkInitialised = true;
}

export class LifiSdkQuoter implements LifiQuoter {
  async getQuote(params: LifiQuoteParams): Promise<LifiQuoteResult> {
    await ensureSdkInit();
    const { getQuote } = await import("@lifi/sdk");

    const quote = await getQuote({
      fromChain: CHAIN_IDS[params.fromChain],
      toChain: CHAIN_IDS[params.toChain],
      fromToken: params.fromTokenAddress,
      toToken: params.toTokenAddress,
      fromAmount: params.fromAmount.toString(),
      fromAddress: params.fromAddress,
    });

    const est = quote.estimate;
    const gasCostUsd = (est.gasCosts ?? []).reduce(
      (sum: number, g: { amountUSD?: string }) => sum + parseFloat(g.amountUSD ?? "0"),
      0,
    );
    const feeCosts: FeeCostItem[] = (est.feeCosts ?? []).map(
      (f: { name: string; amountUSD?: string }) => ({
        name: f.name,
        amountUsd: f.amountUSD ?? "0",
      }),
    );

    return {
      fromAmount: BigInt(est.fromAmount),
      toAmount: BigInt(est.toAmount),
      toAmountMin: BigInt(est.toAmountMin),
      feeCosts,
      gasCostUsd,
      estimatedSeconds: est.executionDuration,
      rawRoute: quote as unknown as Record<string, unknown>,
    };
  }
}
