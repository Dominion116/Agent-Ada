import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Db } from "../../lib/db.js";
import type { AgentCommand, Route, Run } from "@ada/shared";

const { getYields } = vi.hoisted(() => ({ getYields: vi.fn() }));
vi.mock("../yield-discovery.js", () => ({ getYields }));

const { createQuote } = vi.hoisted(() => ({ createQuote: vi.fn() }));
vi.mock("../quote-service.js", () => ({ createQuote }));

const { composeExplanation, composeFreeformReply } = vi.hoisted(() => ({
  composeExplanation: vi.fn(),
  composeFreeformReply: vi.fn(),
}));
vi.mock("../nl-parser.js", () => ({ composeExplanation, composeFreeformReply }));

const { getRuns } = vi.hoisted(() => ({ getRuns: vi.fn() }));
vi.mock("../../lib/db.js", () => ({ getRuns }));

const { getAllStablecoinBalances } = vi.hoisted(() => ({ getAllStablecoinBalances: vi.fn() }));
vi.mock("../../onchain/celo-client.js", () => ({
  ASSET_DECIMALS: { cUSD: 18, USDC: 6 },
  getAllStablecoinBalances,
}));

const { respondToCommand } = await import("../command-responder.js");

const WALLET = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const DB = {} as Db;

const ROUTE: Route = {
  source_chain: "celo",
  source_venue: "moola",
  dest_chain: "celo",
  dest_venue: "aave-v3",
  asset: "USDC",
  amount_in: "100000000",
  amount_out: "100050000",
  route_cost_bps: 10,
  net_gain_bps: 50,
  payback_days: 1,
  estimated_time_seconds: 300,
  lifi_route: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("respondToCommand — check_yields", () => {
  it("summarizes the best USDC yield", async () => {
    const yields = [
      { chain: "celo", venue: "moola", asset: "USDC", supply_rate_bps: 450, utilisation_bps: 8000, last_updated: new Date().toISOString() },
    ];
    getYields.mockResolvedValue(yields);
    const { text, payload } = await respondToCommand({ type: "check_yields" }, "check yields", null, DB);
    expect(text).toMatch(/Found 1 yield sources/);
    expect(text).toMatch(/4\.5%/);
    expect(payload).toEqual({ yields });
  });

  it("falls back to an error message when no yields are available", async () => {
    getYields.mockRejectedValue(new Error("rpc down"));
    const { text, payload } = await respondToCommand({ type: "check_yields" }, "check yields", null, DB);
    expect(text).toBe("Unable to fetch yields right now.");
    expect(payload).toEqual({ yields: [] });
  });
});

describe("respondToCommand — check_balance", () => {
  it("asks anonymous callers to connect a wallet", async () => {
    const { text, payload } = await respondToCommand({ type: "check_balance" }, "balance", null, DB);
    expect(text).toMatch(/connect a wallet/i);
    expect(payload).toBeNull();
  });

  it("returns stablecoin balances for a connected wallet", async () => {
    getAllStablecoinBalances.mockResolvedValue([{ asset: "USDC", raw: 1_000_000n, decimals: 6, formatted: "1.00" }]);
    const { text, payload } = await respondToCommand({ type: "check_balance" }, "balance", WALLET, DB);
    expect(getAllStablecoinBalances).toHaveBeenCalledWith(WALLET);
    expect(text).toMatch(/dashboard/i);
    expect(payload).toEqual({ balances: [{ asset: "USDC", raw: "1000000", decimals: 6, formatted: "1.00" }] });
  });
});

describe("respondToCommand — explain_last_run", () => {
  it("asks anonymous callers to connect a wallet", async () => {
    const { text, payload } = await respondToCommand({ type: "explain_last_run" }, "what happened?", null, DB);
    expect(text).toMatch(/connect a wallet/i);
    expect(payload).toBeNull();
  });

  it("reports when there are no runs yet", async () => {
    getRuns.mockResolvedValue([]);
    const { text, payload } = await respondToCommand({ type: "explain_last_run" }, "what happened?", WALLET, DB);
    expect(text).toBe("No runs found yet.");
    expect(payload).toBeNull();
  });

  it("composes an explanation for the last run", async () => {
    const run = { id: "run-001", status: "completed" } as unknown as Run;
    getRuns.mockResolvedValue([run]);
    composeExplanation.mockResolvedValue("Ada moved your USDC into Aave V3.");
    const { text, payload } = await respondToCommand({ type: "explain_last_run" }, "what happened?", WALLET, DB);
    expect(text).toBe("Ada moved your USDC into Aave V3.");
    expect(payload).toEqual({ run });
  });
});

describe("respondToCommand — rebalance", () => {
  it("asks anonymous callers to connect a wallet", async () => {
    const cmd: AgentCommand = { type: "rebalance", amount: 100 };
    const { text, payload } = await respondToCommand(cmd, "rebalance 100 USDC", null, DB);
    expect(text).toMatch(/connect a wallet/i);
    expect(payload).toBeNull();
  });

  it("returns a quote for a numeric amount", async () => {
    createQuote.mockResolvedValue({
      ok: true,
      quoteId: "quote-1",
      route: ROUTE,
      approvalToken: "approval-jwt",
      expiresAt: "2026-06-15T00:05:00.000Z",
    });
    const cmd: AgentCommand = { type: "rebalance", amount: 100 };
    const { text, payload } = await respondToCommand(cmd, "rebalance 100 USDC", WALLET, DB);

    expect(createQuote).toHaveBeenCalledWith(DB, WALLET, "USDC", 100_000_000n);
    expect(text).toMatch(/moola on celo/);
    expect(text).toMatch(/aave-v3 on celo/);
    expect(text).toMatch(/→/);
    expect(payload).toEqual({
      quoteId: "quote-1",
      route: ROUTE,
      approvalToken: "approval-jwt",
      expiresAt: "2026-06-15T00:05:00.000Z",
    });
  });

  it("surfaces a quote error", async () => {
    createQuote.mockResolvedValue({ ok: false, status: 422, error: "No policy configured" });
    const cmd: AgentCommand = { type: "rebalance", amount: 100 };
    const { text, payload } = await respondToCommand(cmd, "rebalance 100 USDC", WALLET, DB);
    expect(text).toBe("No policy configured");
    expect(payload).toBeNull();
  });

  it("points to the Approvals page for 'all'", async () => {
    const cmd: AgentCommand = { type: "rebalance", amount: "all" };
    const { text, payload } = await respondToCommand(cmd, "rebalance everything", WALLET, DB);
    expect(text).toMatch(/Approvals page/);
    expect(payload).toBeNull();
    expect(createQuote).not.toHaveBeenCalled();
  });
});

describe("respondToCommand — bridge / unknown", () => {
  it("falls back to a freeform reply for unknown commands using the raw text", async () => {
    composeFreeformReply.mockResolvedValue("Hey, I'm Ada!");
    const cmd: AgentCommand = { type: "unknown", raw: "what's the weather?" };
    const { text, payload } = await respondToCommand(cmd, "what's the weather?", null, DB);
    expect(composeFreeformReply).toHaveBeenCalledWith("what's the weather?");
    expect(text).toBe("Hey, I'm Ada!");
    expect(payload).toBeNull();
  });

  it("falls back to a freeform reply for bridge commands using the raw message", async () => {
    composeFreeformReply.mockResolvedValue("Cross-chain support is coming soon.");
    const cmd: AgentCommand = { type: "bridge", amount: 500, from: "celo", to: "base" };
    const { text } = await respondToCommand(cmd, "bridge 500 USDC to base", null, DB);
    expect(composeFreeformReply).toHaveBeenCalledWith("bridge 500 USDC to base");
    expect(text).toBe("Cross-chain support is coming soon.");
  });
});
