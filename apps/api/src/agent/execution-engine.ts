import { randomUUID } from "crypto";
import type { Route, Policy, Run, TxRecord, RunMode, RunStatus } from "@ada/shared";
import { evaluatePolicy, type LastRunInfo } from "./policy-engine.js";
import { buildSupplyToMoola, buildWithdrawFromMoola, MAX_UINT256, type TxCall } from "../onchain/moola-actions.js";

// ── Injectable interfaces ─────────────────────────────────────

/**
 * Sends a single contract call and waits for the receipt.
 * Wraps viem walletClient.writeContract + waitForTransactionReceipt.
 */
export interface TransactionSender {
  send(call: TxCall): Promise<`0x${string}`>;
  waitForReceipt(hash: `0x${string}`): Promise<{
    blockNumber: bigint;
    status: "success" | "reverted";
  }>;
}

/**
 * Executes a saved LI.FI route and calls onStep after each bridge step completes.
 */
export interface LifiExecutor {
  executeRoute(
    rawRoute: Record<string, unknown>,
    sender: TransactionSender,
    onStep: (stepName: string, hash: `0x${string}`, blockNumber: bigint) => void,
  ): Promise<void>;
}

/**
 * Minimal DB surface used by the execution engine.
 * Keeps DB concerns out of the core logic and simplifies testing.
 */
export interface RunRepository {
  create(run: Run): Promise<void>;
  update(id: string, patch: Partial<Pick<Run, "status" | "tx_hashes" | "outcome" | "completed_at">>): Promise<void>;
}

// ── Core params ───────────────────────────────────────────────

export interface ExecuteRebalanceParams {
  walletAddress: `0x${string}`;
  route: Route;
  policy: Policy;
  lastRun: LastRunInfo | null;
  quoteId: string | null;
  mode: RunMode;
  // Infrastructure — required for live mode, ignored for dry-run.
  repo: RunRepository;
  sender?: TransactionSender;
  lifiExecutor?: LifiExecutor;
  // Injectable for deterministic tests.
  now?: Date;
  generateId?: () => string;
}

// ── Helpers ───────────────────────────────────────────────────

function makeInitialRun(params: ExecuteRebalanceParams, id: string, now: Date): Run {
  return {
    id,
    wallet_address: params.walletAddress,
    quote_id: params.quoteId,
    mode: params.mode,
    status: "pending",
    tx_hashes: [],
    policy_version: params.policy.version,
    outcome: null,
    started_at: now.toISOString(),
    completed_at: null,
  };
}

async function recordStep(
  run: Run,
  repo: RunRepository,
  record: TxRecord,
): Promise<void> {
  const updated = [...(run.tx_hashes as TxRecord[]), record];
  run.tx_hashes = updated;
  await repo.update(run.id, { tx_hashes: updated });
}

async function finalize(
  run: Run,
  repo: RunRepository,
  status: RunStatus,
  outcome: Record<string, unknown>,
  now: Date,
): Promise<void> {
  run.status = status;
  run.outcome = outcome;
  run.completed_at = now.toISOString();
  await repo.update(run.id, {
    status,
    outcome,
    completed_at: run.completed_at,
  });
}

// ── Step executor ─────────────────────────────────────────────

async function executeStep(
  run: Run,
  repo: RunRepository,
  sender: TransactionSender,
  call: TxCall,
): Promise<{ hash: `0x${string}`; blockNumber: bigint; ok: boolean }> {
  // Write pending record immediately — visible in dashboard before confirmation.
  const pending: TxRecord = {
    step: call.description,
    hash: null,
    block_number: null,
    status: "pending",
  };
  await recordStep(run, repo, pending);
  const pendingIndex = (run.tx_hashes as TxRecord[]).length - 1;

  let hash: `0x${string}`;
  try {
    hash = await sender.send(call);
  } catch (err) {
    const failed: TxRecord = { ...pending, status: "failed" };
    (run.tx_hashes as TxRecord[])[pendingIndex] = failed;
    await repo.update(run.id, { tx_hashes: run.tx_hashes });
    throw err;
  }

  // Hash known — update record so the dashboard can show the link immediately.
  const submitted: TxRecord = { ...pending, hash, status: "pending" };
  (run.tx_hashes as TxRecord[])[pendingIndex] = submitted;
  await repo.update(run.id, { tx_hashes: run.tx_hashes });

  let receipt: { blockNumber: bigint; status: "success" | "reverted" };
  try {
    receipt = await sender.waitForReceipt(hash);
  } catch (err) {
    const timedOut: TxRecord = { ...submitted, status: "failed" };
    (run.tx_hashes as TxRecord[])[pendingIndex] = timedOut;
    await repo.update(run.id, { tx_hashes: run.tx_hashes });
    throw err;
  }

  const txStatus = receipt.status === "success" ? "confirmed" : "reverted";
  const confirmed: TxRecord = {
    step: call.description,
    hash,
    block_number: Number(receipt.blockNumber),
    status: txStatus,
  };
  (run.tx_hashes as TxRecord[])[pendingIndex] = confirmed;
  await repo.update(run.id, { tx_hashes: run.tx_hashes });

  return { hash, blockNumber: receipt.blockNumber, ok: receipt.status === "success" };
}

// ── Live execution paths ──────────────────────────────────────

async function executeSameChain(
  run: Run,
  route: Route,
  sender: TransactionSender,
  repo: RunRepository,
): Promise<void> {
  const asset = route.asset;
  const amount = BigInt(route.amount_in);
  const wallet = run.wallet_address as `0x${string}`;

  // Withdraw from source venue first.
  const withdrawCalls = buildWithdrawFromMoola(asset, MAX_UINT256, wallet);
  for (const call of withdrawCalls) {
    const result = await executeStep(run, repo, sender, call);
    if (!result.ok) throw new Error(`Step reverted: ${call.description}`);
  }

  // Deposit to destination venue.
  const depositCalls = buildSupplyToMoola(asset, amount, wallet);
  for (const call of depositCalls) {
    const result = await executeStep(run, repo, sender, call);
    if (!result.ok) throw new Error(`Step reverted: ${call.description}`);
  }
}

async function executeCrossChain(
  run: Run,
  route: Route,
  sender: TransactionSender,
  lifiExecutor: LifiExecutor,
  repo: RunRepository,
): Promise<void> {
  const asset = route.asset;
  const wallet = run.wallet_address as `0x${string}`;

  // Step 1: withdraw from Moola on source chain.
  const withdrawCalls = buildWithdrawFromMoola(asset, MAX_UINT256, wallet);
  for (const call of withdrawCalls) {
    const result = await executeStep(run, repo, sender, call);
    if (!result.ok) throw new Error(`Step reverted: ${call.description}`);
  }

  // Step 2: bridge via LI.FI route saved at quote time.
  if (!route.lifi_route) throw new Error("lifi_route is required for cross-chain execution");

  await lifiExecutor.executeRoute(
    route.lifi_route,
    sender,
    async (stepName, hash, blockNumber) => {
      const bridgeRecord: TxRecord = {
        step: `bridge: ${stepName}`,
        hash,
        block_number: Number(blockNumber),
        status: "confirmed",
      };
      await recordStep(run, repo, bridgeRecord);
    },
  );
}

// ── Main entry point ──────────────────────────────────────────

/**
 * Executes a rebalance in dry-run or live mode.
 *
 * Dry-run path:
 *   - Evaluates policy.
 *   - Writes a run record with status dry_run_complete (or failed if policy rejects).
 *   - Emits no transactions.
 *
 * Live path:
 *   - Evaluates policy as a final safety gate.
 *   - Marks the run as executing.
 *   - Sends each on-chain step, recording status after every confirmation.
 *   - Marks the run completed or failed.
 *
 * Every state transition is written to the DB before proceeding to the next step.
 */
export async function executeRebalance(params: ExecuteRebalanceParams): Promise<Run> {
  const now = params.now ?? new Date();
  const id = params.generateId ? params.generateId() : randomUUID();
  const { route, policy, lastRun, mode, repo } = params;

  const run = makeInitialRun(params, id, now);
  await repo.create(run);

  // Policy check — authoritative gate; runs for both dry-run and live.
  const verdict = evaluatePolicy({ route, policy, lastRun, now });

  if (!verdict.pass) {
    await finalize(run, repo, "failed", { verdict }, now);
    return run;
  }

  if (mode === "dry_run") {
    await finalize(run, repo, "dry_run_complete", { verdict, route }, now);
    return run;
  }

  // ── Live execution ────────────────────────────────────────
  if (!params.sender) throw new Error("sender is required for live mode");

  run.status = "executing";
  await repo.update(run.id, { status: "executing" });

  try {
    const isCrossChain = route.source_chain !== route.dest_chain;

    if (isCrossChain) {
      if (!params.lifiExecutor) throw new Error("lifiExecutor is required for cross-chain execution");
      await executeCrossChain(run, route, params.sender, params.lifiExecutor, repo);
    } else {
      await executeSameChain(run, route, params.sender, repo);
    }

    await finalize(run, repo, "completed", { verdict, route }, now);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finalize(run, repo, "failed", { verdict, error: message }, now);
  }

  return run;
}
