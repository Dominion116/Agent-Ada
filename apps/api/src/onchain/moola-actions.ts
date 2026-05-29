import type { Asset } from "@ada/shared";
import { ERC20_ABI, LENDING_POOL_V2_WRITE_ABI } from "../agent/abis.js";
import { CELO_ASSETS, GAS_LIMITS, GAS_PARAMS } from "./celo-client.js";

const MOOLA_LENDING_POOL = "0x970b12522CA9b4054807a2c5B736149a5BE6f670" as const;

// ── TxCall — parameters ready for walletClient.writeContract() ──

export interface TxCall {
  description: string;
  address: `0x${string}`;
  abi: readonly object[];
  functionName: string;
  args: readonly unknown[];
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

// ── Gas override type ────────────────────────────────────────

export interface GasOverride {
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}

// ── Supply (deposit) ─────────────────────────────────────────

/**
 * Builds the ordered transaction steps to supply `amount` of `asset`
 * into Moola Market on behalf of `onBehalfOf`.
 *
 * Returns two steps:
 *   1. ERC-20 approve (LendingPool to spend the asset)
 *   2. LendingPool.deposit
 *
 * The caller (execution engine) sends each step in order and waits
 * for confirmation before proceeding to the next.
 */
export function buildSupplyToMoola(
  asset: Asset,
  amount: bigint,
  onBehalfOf: `0x${string}`,
  gas?: GasOverride,
): TxCall[] {
  const tokenAddress = CELO_ASSETS[asset];
  const gasParams = { ...GAS_PARAMS, ...gas };

  const approve: TxCall = {
    description: `Approve Moola LendingPool to spend ${asset}`,
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [MOOLA_LENDING_POOL, amount],
    gas: GAS_LIMITS.ERC20_APPROVE,
    ...gasParams,
  };

  const deposit: TxCall = {
    description: `Deposit ${asset} into Moola Market`,
    address: MOOLA_LENDING_POOL,
    abi: LENDING_POOL_V2_WRITE_ABI,
    functionName: "deposit",
    args: [tokenAddress, amount, onBehalfOf, 0],
    gas: GAS_LIMITS.MOOLA_DEPOSIT,
    ...gasParams,
  };

  return [approve, deposit];
}

// ── Withdraw ─────────────────────────────────────────────────

/**
 * Builds the transaction step to withdraw `amount` of `asset`
 * from Moola Market, sending the underlying to `to`.
 *
 * Pass `amount = MaxUint256` to withdraw the full position.
 * Returns a single step — no prior approve needed for withdraw.
 */
export function buildWithdrawFromMoola(
  asset: Asset,
  amount: bigint,
  to: `0x${string}`,
  gas?: GasOverride,
): TxCall[] {
  const tokenAddress = CELO_ASSETS[asset];
  const gasParams = { ...GAS_PARAMS, ...gas };

  const withdraw: TxCall = {
    description: `Withdraw ${asset} from Moola Market`,
    address: MOOLA_LENDING_POOL,
    abi: LENDING_POOL_V2_WRITE_ABI,
    functionName: "withdraw",
    args: [tokenAddress, amount, to],
    gas: GAS_LIMITS.MOOLA_WITHDRAW,
    ...gasParams,
  };

  return [withdraw];
}

// ── Max withdraw sentinel ─────────────────────────────────────

/** Pass as `amount` to buildWithdrawFromMoola to close the full position. */
export const MAX_UINT256 = 2n ** 256n - 1n;
