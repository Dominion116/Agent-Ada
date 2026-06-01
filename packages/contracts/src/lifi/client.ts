/**
 * LI.FI SDK execution wrapper.
 *
 * Extends the quote-only LifiSdkQuoter from apps/api with full route
 * execution. The executor is designed to be injected into the execution
 * engine's LifiExecutor interface.
 *
 * getQuote  -- already implemented in apps/api/src/agent/lifi-client.ts
 * executeRoute -- implemented here; wraps @lifi/sdk executeRoute
 */

import type { TxCall } from "../types.js";

// ── Chain and token registry ──────────────────────────────────

export const LIFI_CHAIN_IDS = {
  celo: 42220,
  base: 8453,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
} as const;

export const LIFI_USDC_ADDRESSES: Record<string, `0x${string}`> = {
  celo: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
};

// ── SDK init ──────────────────────────────────────────────────

let _sdkInitialised = false;

async function ensureSdkInit(): Promise<void> {
  if (_sdkInitialised) return;
  const { createConfig } = await import("@lifi/sdk");
  createConfig({ integrator: "agent-ada" });
  _sdkInitialised = true;
}

// ── Executor implementation ───────────────────────────────────

/**
 * Executes a saved LI.FI route using the on-chain sender.
 *
 * LI.FI routes can contain multiple steps (e.g. approve + bridge +
 * destination swap). This executor iterates each step, calls the sender
 * for on-chain steps, and reports each confirmed hash via onStep.
 *
 * The rawRoute must be the verbatim route object returned by getQuote /
 * getRoutes and stored in quotes.lifi_route at quote time.
 */
export interface TransactionSender {
  send(call: TxCall): Promise<`0x${string}`>;
  waitForReceipt(hash: `0x${string}`): Promise<{ blockNumber: bigint; status: "success" | "reverted" }>;
}

export interface LifiExecutor {
  executeRoute(
    rawRoute: Record<string, unknown>,
    sender: TransactionSender,
    onStep: (stepName: string, hash: `0x${string}`, blockNumber: bigint) => void,
  ): Promise<void>;
}

export class LifiSdkExecutor implements LifiExecutor {
  async executeRoute(
    rawRoute: Record<string, unknown>,
    sender: TransactionSender,
    onStep: (stepName: string, hash: `0x${string}`, blockNumber: bigint) => void,
  ): Promise<void> {
    await ensureSdkInit();

    // LI.FI routes are multi-step. Each step has an action and a type.
    // For on-chain steps the SDK provides transaction data we sign ourselves.
    const steps = (rawRoute["steps"] as unknown[]) ?? [];

    if (steps.length === 0) {
      // Single-step quote stored as the root object.
      await this.executeStep(rawRoute, "bridge", sender, onStep);
      return;
    }

    for (const step of steps) {
      const s = step as Record<string, unknown>;
      const name = String((s["toolDetails"] as Record<string, unknown>)?.["name"] ?? s["tool"] ?? "step");
      await this.executeStep(s, name, sender, onStep);
    }
  }

  private async executeStep(
    step: Record<string, unknown>,
    name: string,
    sender: TransactionSender,
    onStep: (stepName: string, hash: `0x${string}`, blockNumber: bigint) => void,
  ): Promise<void> {
    const { getStepTransaction } = await import("@lifi/sdk");

    // Fetch the unsigned transaction data for this step from LI.FI.
    const txRequest = await getStepTransaction(step as unknown as Parameters<typeof getStepTransaction>[0]);

    const tx = txRequest.transactionRequest;
    if (!tx) throw new Error(`No transactionRequest for step "${name}"`);

    // We send it through our TxCall interface so the execution engine can
    // record it uniformly with Moola steps.
    const hash = await sender.send({
      description: `LI.FI: ${name}`,
      address: tx.to as `0x${string}`,
      abi: [],
      functionName: "",
      args: [],
      gas: BigInt(tx.gasLimit ?? 500_000),
      maxFeePerGas: BigInt(tx.maxFeePerGas ?? tx.gasPrice ?? 5_000_000_000n),
      maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas ?? 2_000_000_000n),
    });

    const receipt = await sender.waitForReceipt(hash);
    if (receipt.status !== "success") {
      throw new Error(`LI.FI step "${name}" reverted (hash: ${hash})`);
    }

    onStep(name, hash, receipt.blockNumber);
  }
}
