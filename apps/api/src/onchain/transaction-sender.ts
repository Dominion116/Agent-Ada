import { type Account, type Transport, type WalletClient } from "viem";
import { celo } from "viem/chains";
import { getCeloPublicClient, getCeloWalletClient } from "./celo-client.js";
import type { TransactionSender } from "../agent/execution-engine.js";
import type { TxCall } from "./moola-actions.js";

/**
 * CIP-64 fee-abstraction adapter on Celo mainnet — paying this address as
 * `feeCurrency` lets the agent settle gas in USDC instead of CELO.
 */
export const USDC_FEE_CURRENCY_ADAPTER: `0x${string}` = "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B";

export interface CeloTransactionSenderOptions {
  /** ERC-20 token address used to pay gas (CIP-64 `feeCurrency`). Omit to pay in CELO. */
  feeCurrency?: `0x${string}` | undefined;
}

/**
 * Live `TransactionSender` for same-chain Celo execution. Wraps the agent's
 * wallet client to send each `TxCall` and the public client to await receipts.
 */
export function createCeloTransactionSender(
  options: CeloTransactionSenderOptions = {},
): TransactionSender {
  // Re-typed to `typeof celo` so viem's CIP-64 formatters recognize `feeCurrency`.
  const walletClient = getCeloWalletClient() as WalletClient<Transport, typeof celo, Account>;
  const publicClient = getCeloPublicClient();

  return {
    async send(call: TxCall): Promise<`0x${string}`> {
      return walletClient.writeContract({
        address: call.address,
        abi: call.abi,
        functionName: call.functionName,
        args: call.args,
        gas: call.gas,
        maxFeePerGas: call.maxFeePerGas,
        maxPriorityFeePerGas: call.maxPriorityFeePerGas,
        ...(options.feeCurrency ? { feeCurrency: options.feeCurrency } : {}),
      });
    },

    async waitForReceipt(hash) {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { blockNumber: receipt.blockNumber, status: receipt.status };
    },
  };
}

/**
 * Reads `AGENT_FEE_CURRENCY` ("USDC" or "CELO") and resolves it to the
 * adapter address `createCeloTransactionSender` expects, or `undefined`
 * to pay gas in CELO (the default).
 */
export function feeCurrencyFromEnv(): `0x${string}` | undefined {
  const value = process.env["AGENT_FEE_CURRENCY"]?.toUpperCase();
  if (value === "USDC") return USDC_FEE_CURRENCY_ADAPTER;
  return undefined;
}
