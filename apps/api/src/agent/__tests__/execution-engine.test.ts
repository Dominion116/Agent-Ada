import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeRebalance } from "../execution-engine.js";
import type {
  RunRepository,
  TransactionSender,
  LifiExecutor,
} from "../execution-engine.js";
import type { Policy, Route, Run } from "@ada/shared";

// ── Fixtures ──────────────────────────────────────────────────

const WALLET = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as const;
const NOW = new Date("2026-05-30T12:00:00.000Z");
const FIXED_ID = "aaaaaaaa-0000-0000-0000-000000000001";

const BASE_POLICY: Policy = {
  id: "00000000-0000-0000-0000-000000000001",
  wallet_address: WALLET,
  version: 2,
  min_net_gain_bps: 50,
  max_route_cost_bps: 150,
  cooldown_hours: 24,
  allowed_chains: ["celo", "base", "polygon", "arbitrum", "optimism"],
  allowed_venues: ["moola", "aave-v3"],
  kill_switch: false,
  created_at: "2026-05-01T00:00:00.000Z",
};

const SAME_CHAIN_ROUTE: Route = {
  source_chain: "celo",
  source_venue: "moola",
  dest_chain: "celo",
  dest_venue: "aave-v3",
  asset: "USDC",
  amount_in: "1000000000",
  amount_out: "1000000000",
  route_cost_bps: 0,
  net_gain_bps: 120,
  payback_days: 0,
  estimated_time_seconds: 60,
  lifi_route: null,
};

const CROSS_CHAIN_ROUTE: Route = {
  source_chain: "celo",
  source_venue: "moola",
  dest_chain: "base",
  dest_venue: "aave-v3",
  asset: "USDC",
  amount_in: "1000000000",
  amount_out: "999500000",
  route_cost_bps: 5,
  net_gain_bps: 140,
  payback_days: 13,
  estimated_time_seconds: 300,
  lifi_route: { id: "lifi-route-abc", steps: [] },
};

// ── Mock builders ─────────────────────────────────────────────

function makeRepo(): RunRepository & { created: Run[]; updates: unknown[] } {
  const created: Run[] = [];
  const updates: unknown[] = [];
  return {
    created,
    updates,
    create: vi.fn(async (run: Run) => { created.push({ ...run }); }),
    update: vi.fn(async (_id: string, patch: unknown) => { updates.push(patch); }),
  };
}

function makeSender(opts: { revertOn?: number } = {}): TransactionSender {
  let callCount = 0;
  return {
    send: vi.fn(async () => {
      callCount++;
      if (opts.revertOn === callCount) throw new Error("send failed");
      return `0x${"a".repeat(64)}` as `0x${string}`;
    }),
    waitForReceipt: vi.fn(async () => ({
      blockNumber: 12345678n,
      status: "success" as const,
    })),
  };
}

function makeRevertingSender(): TransactionSender {
  return {
    send: vi.fn(async () => `0x${"b".repeat(64)}` as `0x${string}`),
    waitForReceipt: vi.fn(async () => ({
      blockNumber: 12345679n,
      status: "reverted" as const,
    })),
  };
}

function makeLifiExecutor(fail = false): LifiExecutor {
  return {
    executeRoute: vi.fn(async (_route, _sender, onStep) => {
      if (fail) throw new Error("LI.FI bridge failed");
      await onStep("bridge-step-1", `0x${"c".repeat(64)}` as `0x${string}`, 98765n);
    }),
  };
}

const COMMON = {
  walletAddress: WALLET,
  policy: BASE_POLICY,
  lastRun: null,
  quoteId: "quote-001",
  now: NOW,
  generateId: () => FIXED_ID,
};

// ── Dry-run tests ─────────────────────────────────────────────

describe("executeRebalance — dry_run", () => {
  it("creates a run record before doing anything else", async () => {
    const repo = makeRepo();
    await executeRebalance({ ...COMMON, route: SAME_CHAIN_ROUTE, mode: "dry_run", repo });
    expect(repo.create).toHaveBeenCalledOnce();
    expect(repo.created[0]?.id).toBe(FIXED_ID);
    expect(repo.created[0]?.status).toBe("pending");
  });

  it("sets status to dry_run_complete when policy passes", async () => {
    const repo = makeRepo();
    const run = await executeRebalance({ ...COMMON, route: SAME_CHAIN_ROUTE, mode: "dry_run", repo });

    expect(run.status).toBe("dry_run_complete");
    expect(run.completed_at).toBe(NOW.toISOString());
  });

  it("records the policy_version on the run", async () => {
    const repo = makeRepo();
    const run = await executeRebalance({ ...COMMON, route: SAME_CHAIN_ROUTE, mode: "dry_run", repo });
    expect(run.policy_version).toBe(BASE_POLICY.version);
  });

  it("includes the route in the outcome", async () => {
    const repo = makeRepo();
    const run = await executeRebalance({ ...COMMON, route: SAME_CHAIN_ROUTE, mode: "dry_run", repo });
    expect((run.outcome as Record<string, unknown>)?.["route"]).toEqual(SAME_CHAIN_ROUTE);
  });

  it("emits no transactions in dry-run mode", async () => {
    const repo = makeRepo();
    const sender = makeSender();
    await executeRebalance({ ...COMMON, route: SAME_CHAIN_ROUTE, mode: "dry_run", repo, sender });
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("sets status to failed when policy rejects (kill switch)", async () => {
    const repo = makeRepo();
    const policy = { ...BASE_POLICY, kill_switch: true };
    const run = await executeRebalance({
      ...COMMON, route: SAME_CHAIN_ROUTE, mode: "dry_run", repo, policy,
    });

    expect(run.status).toBe("failed");
    expect(run.outcome).toMatchObject({
      verdict: expect.objectContaining({ pass: false }),
    });
  });

  it("sets status to failed when cooldown has not elapsed", async () => {
    const repo = makeRepo();
    const lastRun = { completed_at: NOW.toISOString() }; // just now, 24h cooldown
    const run = await executeRebalance({
      ...COMMON, route: SAME_CHAIN_ROUTE, mode: "dry_run", repo, lastRun,
    });

    expect(run.status).toBe("failed");
    expect((run.outcome as Record<string, unknown>)?.["verdict"]).toMatchObject({
      pass: false,
      reason: expect.stringMatching(/cooldown/i),
    });
  });
});

// ── Live same-chain tests ─────────────────────────────────────

describe("executeRebalance — live, same-chain", () => {
  it("transitions through pending → executing → completed", async () => {
    const repo = makeRepo();
    const run = await executeRebalance({
      ...COMMON, route: SAME_CHAIN_ROUTE, mode: "live", repo, sender: makeSender(),
    });

    const statusUpdates = (repo.update as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => (c[1] as { status?: string }).status)
      .filter(Boolean);

    expect(statusUpdates).toContain("executing");
    expect(statusUpdates).toContain("completed");
    expect(run.status).toBe("completed");
  });

  it("records a tx hash for each on-chain step", async () => {
    const repo = makeRepo();
    const run = await executeRebalance({
      ...COMMON, route: SAME_CHAIN_ROUTE, mode: "live", repo, sender: makeSender(),
    });

    const txs = run.tx_hashes as { hash: string | null; status: string }[];
    expect(txs.length).toBeGreaterThan(0);
    txs.forEach((tx) => {
      expect(tx.hash).toBeTruthy();
      expect(tx.status).toBe("confirmed");
    });
  });

  it("writes tx state to DB immediately after each step", async () => {
    const repo = makeRepo();
    await executeRebalance({
      ...COMMON, route: SAME_CHAIN_ROUTE, mode: "live", repo, sender: makeSender(),
    });

    // Each step triggers at least two DB updates (pending, then confirmed).
    const txUpdates = (repo.update as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => (c[1] as { tx_hashes?: unknown }).tx_hashes !== undefined);

    expect(txUpdates.length).toBeGreaterThan(0);
  });

  it("sets status to failed and records error when a tx send throws", async () => {
    const repo = makeRepo();
    const sender: TransactionSender = {
      send: vi.fn().mockRejectedValue(new Error("insufficient gas")),
      waitForReceipt: vi.fn(),
    };

    const run = await executeRebalance({
      ...COMMON, route: SAME_CHAIN_ROUTE, mode: "live", repo, sender,
    });

    expect(run.status).toBe("failed");
    expect((run.outcome as Record<string, unknown>)?.["error"]).toMatch(/insufficient gas/);
  });

  it("sets status to failed when a receipt is reverted", async () => {
    const repo = makeRepo();
    const run = await executeRebalance({
      ...COMMON, route: SAME_CHAIN_ROUTE, mode: "live", repo, sender: makeRevertingSender(),
    });

    expect(run.status).toBe("failed");
  });

  it("throws when sender is not provided for live mode", async () => {
    const repo = makeRepo();
    await expect(
      executeRebalance({ ...COMMON, route: SAME_CHAIN_ROUTE, mode: "live", repo }),
    ).rejects.toThrow(/sender is required/);
  });
});

// ── Live cross-chain tests ────────────────────────────────────

describe("executeRebalance — live, cross-chain", () => {
  it("calls lifiExecutor.executeRoute with the saved lifi_route", async () => {
    const repo = makeRepo();
    const lifiExecutor = makeLifiExecutor();

    await executeRebalance({
      ...COMMON,
      route: CROSS_CHAIN_ROUTE,
      mode: "live",
      repo,
      sender: makeSender(),
      lifiExecutor,
    });

    expect(lifiExecutor.executeRoute).toHaveBeenCalledWith(
      CROSS_CHAIN_ROUTE.lifi_route,
      expect.anything(),
      expect.any(Function),
    );
  });

  it("records the bridge step hash in tx_hashes", async () => {
    const repo = makeRepo();
    const run = await executeRebalance({
      ...COMMON,
      route: CROSS_CHAIN_ROUTE,
      mode: "live",
      repo,
      sender: makeSender(),
      lifiExecutor: makeLifiExecutor(),
    });

    const txs = run.tx_hashes as { step: string }[];
    const bridgeStep = txs.find((t) => t.step.startsWith("bridge:"));
    expect(bridgeStep).toBeDefined();
  });

  it("runs Moola withdraw before the LI.FI bridge", async () => {
    const repo = makeRepo();
    const callOrder: string[] = [];

    const sender: TransactionSender = {
      send: vi.fn(async () => {
        callOrder.push("send");
        return `0x${"d".repeat(64)}` as `0x${string}`;
      }),
      waitForReceipt: vi.fn(async () => ({ blockNumber: 1n, status: "success" as const })),
    };

    const lifiExecutor: LifiExecutor = {
      executeRoute: vi.fn(async (_r, _s, onStep) => {
        callOrder.push("lifi");
        await onStep("bridge", `0x${"e".repeat(64)}` as `0x${string}`, 2n);
      }),
    };

    await executeRebalance({
      ...COMMON,
      route: CROSS_CHAIN_ROUTE,
      mode: "live",
      repo,
      sender,
      lifiExecutor,
    });

    expect(callOrder[0]).toBe("send");   // withdraw first
    expect(callOrder.at(-1)).toBe("lifi"); // bridge last
  });

  it("sets status to failed when LI.FI bridge throws", async () => {
    const repo = makeRepo();
    const run = await executeRebalance({
      ...COMMON,
      route: CROSS_CHAIN_ROUTE,
      mode: "live",
      repo,
      sender: makeSender(),
      lifiExecutor: makeLifiExecutor(true), // fails
    });

    expect(run.status).toBe("failed");
    expect((run.outcome as Record<string, unknown>)?.["error"]).toMatch(/LI\.FI bridge failed/);
  });

  it("records a failed run when lifiExecutor is not provided for a cross-chain route", async () => {
    const repo = makeRepo();
    const run = await executeRebalance({
      ...COMMON,
      route: CROSS_CHAIN_ROUTE,
      mode: "live",
      repo,
      sender: makeSender(),
      // no lifiExecutor
    });

    expect(run.status).toBe("failed");
    expect((run.outcome as Record<string, unknown>)?.["error"]).toMatch(/lifiExecutor is required/);
  });
});
