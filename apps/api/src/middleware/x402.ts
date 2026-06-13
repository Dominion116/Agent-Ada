/**
 * x402 payment middleware for Ada's metered endpoints.
 *
 * Settlement goes through thirdweb's hosted x402 facilitator
 * (https://api.thirdweb.com/v1/payments/x402) over plain HTTP `fetch` —
 * the `thirdweb` SDK is not installed anywhere in this repo.
 *
 * Flow per request:
 *   1. Ask the facilitator what payment is required for this resource
 *      (POST /accepts).
 *   2. If the client sent no X-PAYMENT header, return 402 with those
 *      requirements.
 *   3. Otherwise decode the header, verify it against the requirements
 *      (POST /verify), settle it on-chain (POST /settle), record the
 *      settlement in api_calls, and call next().
 *
 * If THIRDWEB_SECRET_KEY / X402_WALLET_ADDRESS / X402_SERVER_WALLET_ADDRESS
 * are not configured, the gate is skipped entirely (useful for local dev
 * and tests).
 */

import type { Request, Response, NextFunction } from "express";
import {
  THIRDWEB_X402_BASE_URL,
  CELO_MAINNET_NETWORK,
  CELO_CUSD_ADDRESS,
  CELO_CUSD_DECIMALS,
  CELO_CUSD_EIP712,
  X402_SCHEME,
  PaymentRequirementSchema,
  decodePaymentHeader,
  encodeSettlementHeader,
  usdToCusdAmount,
  type PaymentRequirement,
  type PaymentPayload,
  type PaymentRequiredBody,
  type VerifyResponse,
  type SettleResponse,
} from "@ada/contracts";
import { getDb, recordApiCall } from "../lib/db.js";
import { logger } from "../lib/logger.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Wallet address that signed the x402 payment, set once settled. */
      x402Payer?: string;
    }
  }
}

export interface X402MiddlewareOptions {
  /** Price as a thirdweb "Money" string, e.g. "$0.001" */
  price: string;
  /** Shown to the client in the payment requirements. */
  description: string;
  /** Label recorded in the api_calls table, e.g. "GET /api/agent/yields" */
  endpoint: string;
}

interface FacilitatorContext {
  secretKey: string;
  payTo: string;
  serverWalletAddress: string;
  network: string;
}

function loadContext(): FacilitatorContext | null {
  const secretKey = process.env["THIRDWEB_SECRET_KEY"];
  const payTo = process.env["X402_WALLET_ADDRESS"];
  const serverWalletAddress = process.env["X402_SERVER_WALLET_ADDRESS"];
  if (!secretKey || !payTo || !serverWalletAddress) return null;

  return {
    secretKey,
    payTo,
    serverWalletAddress,
    network: process.env["X402_NETWORK"] ?? CELO_MAINNET_NETWORK,
  };
}

async function fetchAccepts(
  ctx: FacilitatorContext,
  opts: X402MiddlewareOptions,
  req: Request,
): Promise<PaymentRequirement[]> {
  const resourceUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

  const res = await fetch(`${THIRDWEB_X402_BASE_URL}/accepts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-secret-key": ctx.secretKey },
    body: JSON.stringify({
      x402Version: 1,
      resourceUrl,
      method: req.method,
      network: ctx.network,
      price: {
        amount: usdToCusdAmount(opts.price),
        asset: { address: CELO_CUSD_ADDRESS, decimals: CELO_CUSD_DECIMALS, eip712: CELO_CUSD_EIP712 },
      },
      scheme: X402_SCHEME,
      payTo: ctx.payTo,
      serverWalletAddress: ctx.serverWalletAddress,
      description: opts.description,
    }),
  });

  // thirdweb's /accepts responds with HTTP 402 carrying the payment
  // requirements body (the same shape the resource server returns to its
  // own caller) — only treat genuinely unexpected statuses as failures.
  if (!res.ok && res.status !== 402) throw new Error(`thirdweb /accepts responded ${res.status}`);
  const body = (await res.json()) as { accepts?: unknown[] };
  return (body.accepts ?? []).map((a) => PaymentRequirementSchema.parse(a));
}

async function verifyPayment(
  ctx: FacilitatorContext,
  payload: PaymentPayload,
  requirements: PaymentRequirement,
): Promise<VerifyResponse> {
  const res = await fetch(`${THIRDWEB_X402_BASE_URL}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-secret-key": ctx.secretKey },
    body: JSON.stringify({ x402Version: 1, paymentPayload: payload, paymentRequirements: requirements }),
  });

  if (!res.ok) throw new Error(`thirdweb /verify responded ${res.status}`);
  return (await res.json()) as VerifyResponse;
}

async function settlePayment(
  ctx: FacilitatorContext,
  payload: PaymentPayload,
  requirements: PaymentRequirement,
): Promise<SettleResponse> {
  const res = await fetch(`${THIRDWEB_X402_BASE_URL}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-secret-key": ctx.secretKey },
    body: JSON.stringify({ x402Version: 1, paymentPayload: payload, paymentRequirements: requirements }),
  });

  if (!res.ok) throw new Error(`thirdweb /settle responded ${res.status}`);
  return (await res.json()) as SettleResponse;
}

function paymentRequired(error: string, accepts: PaymentRequirement[]): PaymentRequiredBody {
  return { x402Version: 1, error, accepts };
}

export function createX402Middleware(opts: X402MiddlewareOptions) {
  return async function x402Gate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const ctx = loadContext();
    if (!ctx) {
      next();
      return;
    }

    let accepts: PaymentRequirement[];
    try {
      accepts = await fetchAccepts(ctx, opts, req);
    } catch (err) {
      logger.error({ err }, "x402: failed to fetch payment requirements");
      res.status(502).json(paymentRequired("x402 facilitator unavailable", []));
      return;
    }

    const header = req.header("X-PAYMENT");
    if (!header) {
      res.status(402).json(paymentRequired("Payment required", accepts));
      return;
    }

    let payment: PaymentPayload;
    try {
      payment = decodePaymentHeader(header);
    } catch {
      res.status(402).json(paymentRequired("Invalid X-PAYMENT header", accepts));
      return;
    }

    const requirements = accepts.find(
      (a) => a.scheme === payment.scheme && a.network === payment.network,
    );
    if (!requirements) {
      res.status(402).json(paymentRequired("No matching payment requirements", accepts));
      return;
    }

    try {
      const verification = await verifyPayment(ctx, payment, requirements);
      if (!verification.isValid) {
        res.status(402).json(paymentRequired(verification.invalidReason ?? "Payment verification failed", accepts));
        return;
      }

      const settlement = await settlePayment(ctx, payment, requirements);
      if (!settlement.success) {
        res.status(402).json(paymentRequired(settlement.errorReason ?? "Payment settlement failed", accepts));
        return;
      }

      const invoice = encodeSettlementHeader(settlement);
      res.setHeader("X-PAYMENT-RESPONSE", invoice);
      const payer = settlement.payer ?? verification.payer;
      if (payer) req.x402Payer = payer;

      recordApiCall(getDb(), {
        endpoint: opts.endpoint,
        caller_agent_id: req.header("X-Agent-Id") ?? payer ?? null,
        x402_invoice: invoice,
        settled_tx: settlement.transaction,
      }).catch((err) => logger.error({ err }, "x402: failed to record api_call"));

      next();
    } catch (err) {
      logger.error({ err }, "x402: error verifying/settling payment");
      res.status(502).json(paymentRequired("x402 facilitator unavailable", accepts));
    }
  };
}
