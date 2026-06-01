/**
 * Shared types used across contracts, scripts, and the api.
 *
 * TxCall mirrors apps/api/src/onchain/moola-actions.ts — keeping a copy
 * here avoids a circular dependency between packages/contracts and apps/api.
 */

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
