import { randomUUID } from "crypto";
import { getDb, getLatestPolicy, getRuns, getPositions } from "../lib/db.js";
import { getYields } from "./yield-discovery.js";
import { findBestRoute } from "./route-comparison.js";
import { executeRebalance } from "./execution-engine.js";
import { LifiSdkQuoter } from "./lifi-client.js";
import { sendTelegramNotification } from "../telegram/notify.js";
import { logger } from "../lib/logger.js";
import type { YieldData, Chain, Venue, Asset, Json } from "@ada/shared";
import type { RunRepository } from "./execution-engine.js";

// ── DB-backed RunRepository ───────────────────────────────────

function makeDbRepo(): RunRepository {
  const db = getDb();
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
      if (error) throw new Error(`create run: ${error.message}`);
    },
    async update(id, patch) {
      const { error } = await db
        .from("runs")
        .update({
          ...(patch.status !== undefined && { status: patch.status }),
          ...(patch.tx_hashes !== undefined && { tx_hashes: patch.tx_hashes as unknown as Json }),
          ...(patch.outcome !== undefined && { outcome: patch.outcome as unknown as Json }),
          ...(patch.completed_at !== undefined && { completed_at: patch.completed_at }),
        })
        .eq("id", id);
      if (error) throw new Error(`update run: ${error.message}`);
    },
  };
}

// ── Wallet scanner ────────────────────────────────────────────

/**
 * Runs the agent loop for a single wallet in dry-run mode.
 *
 * Flow:
 *   1. Load policy from DB. Skip if kill_switch is on.
 *   2. Determine the wallet's current Celo position from the positions table.
 *   3. Fetch yield snapshot (cached).
 *   4. Find the best rebalance route that passes the policy.
 *   5. Execute a dry run (no transactions, just a run record).
 *   6. Send a Telegram dry-run notification so the user can approve.
 *
 * Called by the cron scan endpoint for every opted-in wallet.
 */
export async function runAgentForWallet(walletAddress: string): Promise<void> {
  const db = getDb();
  const wallet = walletAddress as `0x${string}`;

  const policy = await getLatestPolicy(db, wallet);
  if (!policy) {
    logger.debug({ wallet }, "No policy found, skipping");
    return;
  }
  if (policy.kill_switch) {
    logger.debug({ wallet }, "Kill switch engaged, skipping");
    return;
  }

  const [lastRun] = await getRuns(db, wallet, { limit: 1 });

  const positions = await getPositions(db, wallet);
  if (positions.length === 0) {
    logger.debug({ wallet }, "No positions found, skipping");
    return;
  }

  const allYields = await getYields();

  // Match the primary position to a yield entry to get the source rate.
  const primary = positions[0]!;
  const sourceYield: YieldData | undefined = allYields.find(
    (y) =>
      y.chain === primary.chain &&
      y.venue === primary.venue &&
      y.asset === primary.asset,
  );

  if (!sourceYield) {
    logger.warn({ wallet, position: primary }, "No yield data for current position");
    return;
  }

  const amountIn = BigInt(Math.round(primary.amount));

  const route = await findBestRoute({
    lifi: new LifiSdkQuoter(),
    source: sourceYield,
    allYields,
    policy: {
      ...policy,
      allowed_chains: policy.allowed_chains as Chain[],
      allowed_venues: policy.allowed_venues as Venue[],
    },
    amountIn,
    fromAddress: wallet,
  });

  if (!route) {
    logger.info({ wallet }, "No better route found, no action taken");
    return;
  }

  const run = await executeRebalance({
    walletAddress: wallet,
    route,
    policy: {
      ...policy,
      allowed_chains: policy.allowed_chains as Chain[],
      allowed_venues: policy.allowed_venues as Venue[],
    },
    lastRun: lastRun ? { completed_at: lastRun.completed_at } : null,
    quoteId: null,
    mode: "dry_run",
    repo: makeDbRepo(),
    generateId: randomUUID,
  });

  await sendTelegramNotification(wallet, "dry_run", run);
  logger.info({ wallet, runId: run.id, status: run.status }, "Agent loop completed");
}

/**
 * Runs the agent loop for all opted-in wallets concurrently (max 10 at a time).
 * Each wallet is independent — one failure does not abort others.
 */
export async function runAgentScan(): Promise<{ scanned: number; errors: number }> {
  const db = getDb();

  const { data: policies, error } = await db
    .from("policies")
    .select("wallet_address")
    .eq("kill_switch", false)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load policies: ${error.message}`);

  const wallets = [...new Set((policies ?? []).map((p) => p.wallet_address))];
  let errors = 0;

  // Process in batches of 10
  const CONCURRENCY = 10;
  for (let i = 0; i < wallets.length; i += CONCURRENCY) {
    const batch = wallets.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((w) => runAgentForWallet(w)),
    );
    errors += results.filter((r) => r.status === "rejected").length;
    results.forEach((r, idx) => {
      if (r.status === "rejected") {
        logger.error({ wallet: batch[idx], err: r.reason }, "Agent loop error");
      }
    });
  }

  return { scanned: wallets.length, errors };
}

// ── Quote and approve-execute helpers ────────────────────────

/**
 * Builds a quote for a user-initiated rebalance request.
 * Returns the best route (or null) without writing anything to DB.
 */
export async function buildQuote(
  walletAddress: string,
  asset: Asset,
  amountIn: bigint,
): Promise<ReturnType<typeof findBestRoute>> {
  const db = getDb();
  const wallet = walletAddress as `0x${string}`;

  const policy = await getLatestPolicy(db, wallet);
  if (!policy) return null;

  const allYields = await getYields();
  const positions = await getPositions(db, wallet);

  const primary = positions.find((p) => p.asset === asset);
  const sourceYield = allYields.find(
    (y) =>
      y.chain === (primary?.chain ?? "celo") &&
      y.venue === (primary?.venue ?? "moola") &&
      y.asset === asset,
  );

  if (!sourceYield) return null;

  return findBestRoute({
    lifi: new LifiSdkQuoter(),
    source: sourceYield,
    allYields,
    policy: {
      ...policy,
      allowed_chains: policy.allowed_chains as Chain[],
      allowed_venues: policy.allowed_venues as Venue[],
    },
    amountIn,
    fromAddress: wallet,
  });
}
