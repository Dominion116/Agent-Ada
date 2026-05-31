import { describe, it, expect, vi } from "vitest";
import { parseCommand, composeExplanation, type GeminiClient } from "../nl-parser.js";
import type { Run } from "@ada/shared";

// ── Mock client builder ───────────────────────────────────────

function makeClient(response: string): GeminiClient {
  return { chat: vi.fn().mockResolvedValue(response) };
}

function makeFailingClient(): GeminiClient {
  return { chat: vi.fn().mockRejectedValue(new Error("quota exceeded")) };
}

const WALLET = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

// ── Hard-coded shortcuts (no LLM call) ───────────────────────

describe("parseCommand — shortcuts (no LLM)", () => {
  it("parses 'check yields' without calling Gemini", async () => {
    const client = makeClient("should not be called");
    const cmd = await parseCommand("check yields", WALLET, client);
    expect(cmd.type).toBe("check_yields");
    expect(client.chat).not.toHaveBeenCalled();
  });

  it("parses 'yields' shorthand without calling Gemini", async () => {
    const client = makeClient("irrelevant");
    const cmd = await parseCommand("yields", WALLET, client);
    expect(cmd.type).toBe("check_yields");
    expect(client.chat).not.toHaveBeenCalled();
  });

  it("parses 'check balance' without calling Gemini", async () => {
    const client = makeClient("irrelevant");
    const cmd = await parseCommand("check balance", WALLET, client);
    expect(cmd.type).toBe("check_balance");
    expect(client.chat).not.toHaveBeenCalled();
  });

  it("parses 'balance' shorthand without calling Gemini", async () => {
    const client = makeClient("irrelevant");
    const cmd = await parseCommand("balance", WALLET, client);
    expect(cmd.type).toBe("check_balance");
    expect(client.chat).not.toHaveBeenCalled();
  });

  it("parses 'explain last run' without calling Gemini", async () => {
    const client = makeClient("irrelevant");
    const cmd = await parseCommand("explain last run", WALLET, client);
    expect(cmd.type).toBe("explain_last_run");
    expect(client.chat).not.toHaveBeenCalled();
  });
});

// ── parseCommand via Gemini ───────────────────────────────────

describe("parseCommand — Gemini path", () => {
  it("parses check_yields from Gemini JSON", async () => {
    const cmd = await parseCommand(
      "What yields are available right now?",
      WALLET,
      makeClient('{"type":"check_yields"}'),
    );
    expect(cmd.type).toBe("check_yields");
  });

  it("parses check_balance from Gemini JSON", async () => {
    const cmd = await parseCommand(
      "How much USDC do I have?",
      WALLET,
      makeClient('{"type":"check_balance"}'),
    );
    expect(cmd.type).toBe("check_balance");
  });

  it("parses rebalance with numeric amount", async () => {
    const cmd = await parseCommand(
      "Rebalance 250 USDC into the best yield",
      WALLET,
      makeClient('{"type":"rebalance","amount":250}'),
    );
    expect(cmd.type).toBe("rebalance");
    if (cmd.type === "rebalance") expect(cmd.amount).toBe(250);
  });

  it("parses rebalance with 'all'", async () => {
    const cmd = await parseCommand(
      "Put all my idle balance to work",
      WALLET,
      makeClient('{"type":"rebalance","amount":"all"}'),
    );
    expect(cmd.type).toBe("rebalance");
    if (cmd.type === "rebalance") expect(cmd.amount).toBe("all");
  });

  it("parses bridge command with chain names", async () => {
    const cmd = await parseCommand(
      "Bridge 500 USDC from Celo to Base",
      WALLET,
      makeClient('{"type":"bridge","amount":500,"from":"celo","to":"base"}'),
    );
    expect(cmd.type).toBe("bridge");
    if (cmd.type === "bridge") {
      expect(cmd.amount).toBe(500);
      expect(cmd.from).toBe("celo");
      expect(cmd.to).toBe("base");
    }
  });

  it("parses explain_last_run", async () => {
    const cmd = await parseCommand(
      "What happened in my last rebalance?",
      WALLET,
      makeClient('{"type":"explain_last_run"}'),
    );
    expect(cmd.type).toBe("explain_last_run");
  });

  it("parses unknown command and includes raw text", async () => {
    const cmd = await parseCommand(
      "What is the weather today?",
      WALLET,
      makeClient('{"type":"unknown","raw":"What is the weather today?"}'),
    );
    expect(cmd.type).toBe("unknown");
    if (cmd.type === "unknown") expect(cmd.raw).toBe("What is the weather today?");
  });

  it("strips markdown fences before parsing JSON", async () => {
    const cmd = await parseCommand(
      "check my yields",
      WALLET,
      makeClient('```json\n{"type":"check_yields"}\n```'),
    );
    expect(cmd.type).toBe("check_yields");
  });

  it("falls back to unknown when Gemini returns malformed JSON", async () => {
    const raw = "how much yield am i getting";
    const cmd = await parseCommand(raw, WALLET, makeClient("not json at all"));
    expect(cmd.type).toBe("unknown");
    if (cmd.type === "unknown") expect(cmd.raw).toBe(raw);
  });

  it("falls back to unknown when Gemini returns an invalid command type", async () => {
    const raw = "delete my account";
    const cmd = await parseCommand(
      raw,
      WALLET,
      makeClient('{"type":"delete_account"}'),
    );
    expect(cmd.type).toBe("unknown");
    if (cmd.type === "unknown") expect(cmd.raw).toBe(raw);
  });

  it("falls back to unknown when Gemini call fails", async () => {
    const raw = "do something";
    const cmd = await parseCommand(raw, WALLET, makeFailingClient());
    expect(cmd.type).toBe("unknown");
    if (cmd.type === "unknown") expect(cmd.raw).toBe(raw);
  });
});

// ── composeExplanation ────────────────────────────────────────

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: "run-001",
    wallet_address: WALLET,
    quote_id: "quote-001",
    mode: "live",
    status: "completed",
    tx_hashes: [{ step: "withdraw", hash: "0xabc", block_number: 1000, status: "confirmed" }],
    policy_version: 1,
    outcome: {
      route: {
        source_venue: "moola",
        source_chain: "celo",
        dest_venue: "aave-v3",
        dest_chain: "base",
        amount_in: "1000000000",
        amount_out: "999500000",
      },
    },
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("composeExplanation", () => {
  it("calls Gemini with a prompt containing run details", async () => {
    const client = makeClient("Your rebalance moved funds from Moola to Aave.");
    await composeExplanation(makeRun(), client);
    expect(client.chat).toHaveBeenCalledOnce();
    const [systemPrompt, userMessage] = (client.chat as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(systemPrompt).toMatch(/explain/i);
    expect(userMessage).toContain("moola");
  });

  it("returns the Gemini response string", async () => {
    const expected = "Ada moved your USDC from Moola on Celo to Aave V3 on Base.";
    const result = await composeExplanation(makeRun(), makeClient(expected));
    expect(result).toBe(expected);
  });

  it("returns a template message for a completed run when Gemini fails", async () => {
    const result = await composeExplanation(makeRun({ status: "completed" }), makeFailingClient());
    expect(result).toMatch(/completed successfully/i);
  });

  it("returns a template message for a dry run when Gemini fails", async () => {
    const result = await composeExplanation(
      makeRun({ mode: "dry_run", status: "dry_run_complete" }),
      makeFailingClient(),
    );
    expect(result).toMatch(/simulation/i);
  });

  it("returns a template message with error text for a failed run when Gemini fails", async () => {
    const run = makeRun({
      status: "failed",
      outcome: { error: "kill switch is active" },
    });
    const result = await composeExplanation(run, makeFailingClient());
    expect(result).toMatch(/kill switch is active/i);
  });
});
