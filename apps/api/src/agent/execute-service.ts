import { randomUUID } from "crypto";
import { getLatestPolicy, getRuns, type Db } from "../lib/db.js";
import { verifyApprovalToken } from "../lib/jwt.js";
import { executeRebalance, type RunRepository } from "./execution-engine.js";
import { createCeloTransactionSender, feeCurrencyFromEnv } from "../onchain/transaction-sender.js";
import { sendTelegramNotification } from "../telegram/notify.js";
import type { Chain, Venue, Asset, Json, Run } from "@ada/shared";

export type ExecuteResult =
  | { ok: true; run: Run }
  | { ok: false; status: number; error: string };

function dbRepo(db: Db): RunRepository {
  return {
    async create(run) {
      const { error } = await db.from("runs").insert({
        id: run.id,
        wallet_address: run.wallet_address,
        quote_id: run.quote_id,
        mode: run.mode,
        status: run.status,
        tx_hashes: run.tx_hashes,
        policy_version: run.policy_version,
        outcome: run.outcome as unknown as Json | null,
        started_at: run.started_at,
        completed_at: run.completed_at,
      });
      if (error) throw new Error(error.message);
    },
    async update(id, patch) {
      const { error } = await db.from("runs").update({
        ...(patch.status !== undefined && { status: patch.status }),
        ...(patch.tx_hashes !== undefined && { tx_hashes: patch.tx_hashes as unknown as Json }),
        ...(patch.outcome !== undefined && { outcome: patch.outcome as unknown as Json }),
        ...(patch.completed_at !== undefined && { completed_at: patch.completed_at }),
      }).eq("id", id);
      if (error) throw new Error(error.message);
    },
  };
}

/**
 * Verifies an approval token, loads the matching quote, and submits the
 * on-chain transactions for it. Shared by POST /api/agent/execute and the
 * A2A `execute-rebalance` skill.
 */
export async function executeApprovedRebalance(
  db: Db,
  walletAddress: string,
  approvalToken: string,
): Promise<ExecuteResult> {
  let quoteId: string;
  try {
    const verified = await verifyApprovalToken(approvalToken);
    if (verified.walletAddress !== walletAddress) {
      return { ok: false, status: 403, error: "Token does not match session wallet" };
    }
    quoteId = verified.quoteId;
  } catch {
    return { ok: false, status: 401, error: "Invalid or expired approval token" };
  }

  const { data: quote } = await db.from("quotes").select("*").eq("id", quoteId).maybeSingle();
  if (!quote) return { ok: false, status: 404, error: "Quote not found or expired" };
  if (new Date(quote.expires_at) < new Date()) return { ok: false, status: 410, error: "Quote expired" };

  if (quote.source_chain !== quote.dest_chain) {
    return {
      ok: false,
      status: 501,
      error: "Cross-chain execution is coming soon. Reject this quote or wait for a same-chain opportunity.",
    };
  }

  const policy = await getLatestPolicy(db, walletAddress);
  if (!policy) return { ok: false, status: 422, error: "No policy configured" };

  const [lastRun] = await getRuns(db, walletAddress, { limit: 1 });

  const route = {
    source_chain: quote.source_chain as Chain,
    source_venue: quote.source_venue as Venue,
    dest_chain: quote.dest_chain as Chain,
    dest_venue: quote.dest_venue as Venue,
    asset: quote.asset as Asset,
    amount_in: String(quote.amount),
    amount_out: String(quote.amount * (1 - quote.route_cost_bps / 10000)),
    route_cost_bps: quote.route_cost_bps,
    net_gain_bps: quote.net_gain_bps,
    payback_days: quote.payback_days,
    estimated_time_seconds: 300,
    lifi_route: null,
  };

  const run = await executeRebalance({
    walletAddress: walletAddress as `0x${string}`,
    route,
    policy: { ...policy, allowed_chains: policy.allowed_chains as Chain[], allowed_venues: policy.allowed_venues as Venue[] },
    lastRun: lastRun ? { completed_at: lastRun.completed_at } : null,
    quoteId,
    mode: "live",
    repo: dbRepo(db),
    generateId: randomUUID,
    sender: createCeloTransactionSender({ feeCurrency: feeCurrencyFromEnv() }),
  });

  const event = run.status === "completed" ? "executed" : "error";
  sendTelegramNotification(walletAddress, event, run).catch(() => {});

  return { ok: true, run };
}
