/**
 * Self-settlement for x402 "exact" + EIP-2612 Permit payments (cUSD on Celo).
 *
 * thirdweb's hosted /settle requires mainnet billing for its bundler/paymaster
 * infra, which this project doesn't pay for. Instead, the agent's own EOA
 * (AGENT_PRIVATE_KEY) redeems the payer's signed Permit directly on-chain:
 *
 *   1. permit(owner, spender=agent, value, deadline, v, r, s) — sets the
 *      allowance using the payer's EIP-712 signature, no payer gas needed.
 *   2. transferFrom(owner, agent, value) — pulls the payment.
 *
 * Cost is just Celo gas (~$0.0001/tx), paid by the agent wallet.
 */

import { type Account, type Transport, type WalletClient, parseSignature } from "viem";
import { celo } from "viem/chains";
import type { PaymentPayload, PaymentRequirement, SettleResponse } from "@ada/contracts";
import { ERC20_PERMIT_ABI } from "../agent/abis.js";
import { getCeloPublicClient, getCeloWalletClient } from "./celo-client.js";

export async function settleCusdPermit(
  payload: PaymentPayload,
  requirements: PaymentRequirement,
): Promise<SettleResponse> {
  const { authorization, signature } = payload.payload;
  const owner = authorization.from as `0x${string}`;
  const spender = authorization.to as `0x${string}`;
  const value = BigInt(authorization.value);
  const deadline = BigInt(authorization.validBefore);
  const asset = requirements.asset as `0x${string}`;

  const { r, s, v } = parseSignature(signature as `0x${string}`);
  if (v === undefined) {
    return {
      success: false,
      errorReason: "invalid signature: missing recovery bit",
      payer: owner,
      transaction: "",
      network: requirements.network,
    };
  }

  const walletClient = getCeloWalletClient() as WalletClient<Transport, typeof celo, Account>;
  const publicClient = getCeloPublicClient();

  try {
    const permitHash = await walletClient.writeContract({
      address: asset,
      abi: ERC20_PERMIT_ABI,
      functionName: "permit",
      args: [owner, spender, value, deadline, Number(v), r, s],
    });
    await publicClient.waitForTransactionReceipt({ hash: permitHash });

    const transferHash = await walletClient.writeContract({
      address: asset,
      abi: ERC20_PERMIT_ABI,
      functionName: "transferFrom",
      args: [owner, spender, value],
    });
    await publicClient.waitForTransactionReceipt({ hash: transferHash });

    return { success: true, payer: owner, transaction: transferHash, network: requirements.network };
  } catch (err) {
    return {
      success: false,
      errorReason: err instanceof Error ? err.message : "on-chain settlement failed",
      payer: owner,
      transaction: "",
      network: requirements.network,
    };
  }
}
