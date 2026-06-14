import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Db } from "../../lib/db.js";
import type { Route, Run } from "@ada/shared";

const { createQuote } = vi.hoisted(() => ({ createQuote: vi.fn() }));
vi.mock("../quote-service.js", () => ({ createQuote }));

const { executeApprovedRebalance } = vi.hoisted(() => ({ executeApprovedRebalance: vi.fn() }));
vi.mock("../execute-service.js", () => ({ executeApprovedRebalance }));

const { parseCommand } = vi.hoisted(() => ({ parseCommand: vi.fn() }));
vi.mock("../nl-parser.js", () => ({ parseCommand }));

const { respondToCommand } = vi.hoisted(() => ({ respondToCommand: vi.fn() }));
vi.mock("../command-responder.js", () => ({ respondToCommand }));

const { handleA2AMessage } = await import("../a2a-handler.js");

const WALLET = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const DB = {} as Db;

const ROUTE: Route = {
  source_chain: "celo",
  source_venue: "moola",
  dest_chain: "celo",
  dest_venue: "aave-v3",
  asset: "USDC",
  amount_in: "1000000",
  amount_out: "1000500",
  route_cost_bps: 10,
  net_gain_bps: 50,
  payback_days: 1,
  estimated_time_seconds: 300,
  lifi_route: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleA2AMessage — get-rebalance-quote", () => {
  it("requires an authenticated wallet", async () => {
    const result = await handleA2AMessage(
      { text: "", data: { skill: "get-rebalance-quote", input: { amount: "1000000" } }, walletAddress: null },
      DB,
    );
    expect(result.text).toMatch(/authenticated wallet/i);
    expect(createQuote).not.toHaveBeenCalled();
  });

  it("requires input.amount", async () => {
    const result = await handleA2AMessage(
      { text: "", data: { skill: "get-rebalance-quote", input: {} }, walletAddress: WALLET },
      DB,
    );
    expect(result.text).toBe("get-rebalance-quote requires input.amount (atomic units).");
  });

  it("returns a quote, defaulting asset to USDC", async () => {
    createQuote.mockResolvedValue({
      ok: true,
      quoteId: "quote-1",
      route: ROUTE,
      approvalToken: "approval-jwt",
      expiresAt: "2026-06-15T00:05:00.000Z",
    });
    const result = await handleA2AMessage(
      { text: "", data: { skill: "get-rebalance-quote", input: { amount: "1000000" } }, walletAddress: WALLET },
      DB,
    );
    expect(createQuote).toHaveBeenCalledWith(DB, WALLET, "USDC", 1_000_000n);
    expect(result.text).toMatch(/Quote ready/);
    expect(result.text).toMatch(/moola on celo/);
    expect(result.text).toMatch(/→/);
    expect(result.text).toMatch(/aave-v3 on celo/);
    expect(result.data).toEqual({
      quoteId: "quote-1",
      route: ROUTE,
      approvalToken: "approval-jwt",
      expiresAt: "2026-06-15T00:05:00.000Z",
    });
  });

  it("honors an explicit asset", async () => {
    createQuote.mockResolvedValue({
      ok: true,
      quoteId: "quote-1",
      route: ROUTE,
      approvalToken: "approval-jwt",
      expiresAt: "2026-06-15T00:05:00.000Z",
    });
    await handleA2AMessage(
      { text: "", data: { skill: "get-rebalance-quote", input: { amount: "1000000", asset: "cUSD" } }, walletAddress: WALLET },
      DB,
    );
    expect(createQuote).toHaveBeenCalledWith(DB, WALLET, "cUSD", 1_000_000n);
  });

  it("surfaces a quote error", async () => {
    createQuote.mockResolvedValue({ ok: false, status: 422, error: "No policy configured" });
    const result = await handleA2AMessage(
      { text: "", data: { skill: "get-rebalance-quote", input: { amount: "1000000" } }, walletAddress: WALLET },
      DB,
    );
    expect(result.text).toBe("No policy configured");
    expect(result.data).toBeUndefined();
  });
});

describe("handleA2AMessage — execute-rebalance", () => {
  it("requires an authenticated wallet", async () => {
    const result = await handleA2AMessage(
      { text: "", data: { skill: "execute-rebalance", input: { approvalToken: "tok" } }, walletAddress: null },
      DB,
    );
    expect(result.text).toMatch(/authenticated wallet/i);
    expect(executeApprovedRebalance).not.toHaveBeenCalled();
  });

  it("requires input.approvalToken", async () => {
    const result = await handleA2AMessage(
      { text: "", data: { skill: "execute-rebalance", input: {} }, walletAddress: WALLET },
      DB,
    );
    expect(result.text).toBe("execute-rebalance requires input.approvalToken.");
  });

  it("returns the run for a valid approval token", async () => {
    const run = { id: "run-001", status: "completed" } as unknown as Run;
    executeApprovedRebalance.mockResolvedValue({ ok: true, run });
    const result = await handleA2AMessage(
      { text: "", data: { skill: "execute-rebalance", input: { approvalToken: "tok" } }, walletAddress: WALLET },
      DB,
    );
    expect(executeApprovedRebalance).toHaveBeenCalledWith(DB, WALLET, "tok");
    expect(result.text).toBe("Run run-001 completed.");
    expect(result.data).toEqual({ run });
  });

  it("surfaces an execution error", async () => {
    executeApprovedRebalance.mockResolvedValue({ ok: false, status: 410, error: "Quote expired" });
    const result = await handleA2AMessage(
      { text: "", data: { skill: "execute-rebalance", input: { approvalToken: "tok" } }, walletAddress: WALLET },
      DB,
    );
    expect(result.text).toBe("Quote expired");
    expect(result.data).toBeUndefined();
  });
});

describe("handleA2AMessage — natural language fallback", () => {
  it("parses and dispatches free-text messages, dropping a null payload", async () => {
    parseCommand.mockResolvedValue({ type: "check_yields" });
    respondToCommand.mockResolvedValue({ text: "Found 2 yield sources.", payload: null });

    const result = await handleA2AMessage({ text: "check yields", walletAddress: null }, DB);

    expect(parseCommand).toHaveBeenCalledWith("check yields", "anonymous");
    expect(respondToCommand).toHaveBeenCalledWith({ type: "check_yields" }, "check yields", null, DB);
    expect(result).toEqual({ text: "Found 2 yield sources." });
  });

  it("includes the payload as data when present", async () => {
    parseCommand.mockResolvedValue({ type: "check_yields" });
    respondToCommand.mockResolvedValue({ text: "Found 1 yield source.", payload: { yields: [] } });

    const result = await handleA2AMessage({ text: "check yields", walletAddress: WALLET }, DB);

    expect(parseCommand).toHaveBeenCalledWith("check yields", WALLET);
    expect(result).toEqual({ text: "Found 1 yield source.", data: { yields: [] } });
  });
});
