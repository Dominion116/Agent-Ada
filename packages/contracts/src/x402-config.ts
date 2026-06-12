/**
 * x402 payment config shared between the Ada API and any package that needs
 * to describe Ada's metered endpoints (e.g. agent-metadata.ts).
 *
 * Settlement goes through thirdweb's hosted x402 facilitator
 * (https://api.thirdweb.com/v1/payments/x402) over plain HTTP — see
 * apps/api/src/middleware/x402.ts. The `thirdweb` SDK is intentionally NOT a
 * dependency anywhere in this repo; everything here is plain constants,
 * Zod schemas, and base64 encode/decode helpers for the x402 wire format.
 */

import { z } from "zod";

// ── Facilitator ──────────────────────────────────────────────

export const THIRDWEB_X402_BASE_URL = "https://api.thirdweb.com/v1/payments/x402";

// ── Network (CAIP-2 chain identifiers) ──────────────────────────
// thirdweb's facilitator accepts a raw CAIP-2 id for chains that aren't in
// its short-name map (e.g. "celo" isn't recognized, but "eip155:42220" is).

export const CELO_MAINNET_NETWORK = "eip155:42220";
export const CELO_SEPOLIA_NETWORK = "eip155:11142220";

/** Native USDC on Celo mainnet (6 decimals). */
export const CELO_USDC_ADDRESS: `0x${string}` = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";

export const X402_SCHEME = "exact" as const;

// ── Prices ───────────────────────────────────────────────────
// thirdweb's /accepts endpoint takes a "Money" string, e.g. "$0.001".

export const X402_PRICES = {
  yields: "$0.001",
  execute: "$0.10",
} as const;

// ── Payment requirement (returned by /accepts, echoed to /verify + /settle) ──

export const PaymentRequirementSchema = z.object({
  scheme: z.literal("exact"),
  network: z.string(),
  maxAmountRequired: z.string(),
  resource: z.string(),
  description: z.string(),
  mimeType: z.string(),
  payTo: z.string(),
  maxTimeoutSeconds: z.number(),
  asset: z.string(),
  extra: z.record(z.unknown()).optional(),
});
export type PaymentRequirement = z.infer<typeof PaymentRequirementSchema>;

// ── Payment payload (sent by the client in the X-PAYMENT header) ──
// EIP-3009 transferWithAuthorization, as used by the "exact" EVM scheme.

export const ExactEvmAuthorizationSchema = z.object({
  from: z.string(),
  to: z.string(),
  value: z.string(),
  validAfter: z.string(),
  validBefore: z.string(),
  nonce: z.string(),
});
export type ExactEvmAuthorization = z.infer<typeof ExactEvmAuthorizationSchema>;

export const PaymentPayloadSchema = z.object({
  x402Version: z.number(),
  scheme: z.literal("exact"),
  network: z.string(),
  payload: z.object({
    signature: z.string(),
    authorization: ExactEvmAuthorizationSchema,
  }),
});
export type PaymentPayload = z.infer<typeof PaymentPayloadSchema>;

// ── Facilitator responses ───────────────────────────────────────

export const VerifyResponseSchema = z.object({
  isValid: z.boolean(),
  invalidReason: z.string().optional(),
  payer: z.string().optional(),
});
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;

export const SettleResponseSchema = z.object({
  success: z.boolean(),
  errorReason: z.string().optional(),
  payer: z.string().optional(),
  transaction: z.string(),
  network: z.string(),
});
export type SettleResponse = z.infer<typeof SettleResponseSchema>;

// ── 402 response body sent to clients that haven't paid yet ──────

export interface PaymentRequiredBody {
  x402Version: 1;
  error: string;
  accepts: PaymentRequirement[];
}

// ── Header encode/decode ──────────────────────────────────────
// x402 v1: the payment payload travels in the X-PAYMENT request header and
// the settlement receipt travels back in X-PAYMENT-RESPONSE, both base64.

export function decodePaymentHeader(header: string): PaymentPayload {
  const json = Buffer.from(header, "base64").toString("utf-8");
  return PaymentPayloadSchema.parse(JSON.parse(json));
}

export function encodeSettlementHeader(receipt: SettleResponse): string {
  return Buffer.from(JSON.stringify(receipt), "utf-8").toString("base64");
}
