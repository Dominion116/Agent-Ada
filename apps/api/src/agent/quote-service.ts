import { randomUUID } from "crypto";
import { getLatestPolicy, type Db } from "../lib/db.js";
import { signApprovalToken } from "../lib/jwt.js";
import { buildQuote } from "./loop.js";
import type { Asset, Route } from "@ada/shared";

export type QuoteResult =
  | { ok: true; quoteId: string; route: Route; approvalToken: string; expiresAt: string }
  | { ok: false; status: number; error: string };

/**
 * Scans current yields, prices a rebalance route for `walletAddress`, and
 * persists a quote with a signed 5-minute approval token. Shared by
 * POST /api/agent/quote and the A2A `get-rebalance-quote` skill.
 */
export async function createQuote(
  db: Db,
  walletAddress: string,
  asset: Asset,
  amountIn: bigint,
): Promise<QuoteResult> {
  const route = await buildQuote(walletAddress, asset, amountIn);
  if (!route) return { ok: false, status: 422, error: "No better route found or no policy configured" };

  const policy = await getLatestPolicy(db, walletAddress);
  if (!policy) return { ok: false, status: 422, error: "No policy configured" };

  const quoteId = randomUUID();
  const approvalToken = await signApprovalToken(quoteId, walletAddress);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const { error } = await db.from("quotes").insert({
    id: quoteId,
    wallet_address: walletAddress,
    source_chain: route.source_chain,
    source_venue: route.source_venue,
    dest_chain: route.dest_chain,
    dest_venue: route.dest_venue,
    asset: route.asset,
    amount: Number(route.amount_in),
    route_cost_bps: route.route_cost_bps,
    net_gain_bps: route.net_gain_bps,
    payback_days: route.payback_days,
    policy_version: policy.version,
    approval_token: approvalToken,
    expires_at: expiresAt,
  });
  if (error) return { ok: false, status: 500, error: error.message };

  return { ok: true, quoteId, route, approvalToken, expiresAt };
}
