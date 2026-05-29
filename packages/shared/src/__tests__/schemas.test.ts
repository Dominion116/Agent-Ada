import { describe, it, expect } from "vitest";
import {
  UserSchema,
  PolicySchema,
  DefaultPolicy,
  PolicyUpdateSchema,
  PositionSchema,
  QuoteSchema,
  RunSchema,
  YieldDataSchema,
  RouteSchema,
  TelegramConfigSchema,
  ApiCallSchema,
  ChatMessageSchema,
  AgentCommandSchema,
} from "../index.js";

const WALLET = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const UUID = "123e4567-e89b-12d3-a456-426614174000";
const NOW = new Date().toISOString();

describe("UserSchema", () => {
  it("accepts a valid user", () => {
    expect(() =>
      UserSchema.parse({
        id: UUID,
        wallet_address: WALLET,
        self_agent_id: null,
        created_at: NOW,
      })
    ).not.toThrow();
  });

  it("rejects an invalid wallet address", () => {
    expect(() =>
      UserSchema.parse({
        id: UUID,
        wallet_address: "not-an-address",
        self_agent_id: null,
        created_at: NOW,
      })
    ).toThrow();
  });
});

describe("PolicySchema", () => {
  it("accepts a valid policy", () => {
    expect(() =>
      PolicySchema.parse({
        id: UUID,
        wallet_address: WALLET,
        version: 1,
        ...DefaultPolicy,
        created_at: NOW,
      })
    ).not.toThrow();
  });

  it("rejects negative min_net_gain_bps", () => {
    expect(() =>
      PolicyUpdateSchema.parse({ ...DefaultPolicy, min_net_gain_bps: -1 })
    ).toThrow();
  });

  it("rejects empty allowed_chains", () => {
    expect(() =>
      PolicyUpdateSchema.parse({ ...DefaultPolicy, allowed_chains: [] })
    ).toThrow();
  });
});

describe("PositionSchema", () => {
  it("accepts a valid position", () => {
    expect(() =>
      PositionSchema.parse({
        id: UUID,
        wallet_address: WALLET,
        chain: "celo",
        venue: "moola",
        asset: "cUSD",
        amount: "1000000000000000000",
        supply_rate_bps: 450,
        updated_at: NOW,
      })
    ).not.toThrow();
  });
});

describe("YieldDataSchema", () => {
  it("rejects utilisation above 10000 bps", () => {
    expect(() =>
      YieldDataSchema.parse({
        chain: "celo",
        venue: "moola",
        asset: "cUSD",
        supply_rate_bps: 400,
        utilisation_bps: 10001,
        last_updated: NOW,
      })
    ).toThrow();
  });
});

describe("RunSchema", () => {
  it("accepts a completed live run", () => {
    expect(() =>
      RunSchema.parse({
        id: UUID,
        wallet_address: WALLET,
        quote_id: UUID,
        mode: "live",
        status: "completed",
        tx_hashes: [
          {
            step: "supply",
            hash: "0xabc",
            block_number: 12345,
            status: "confirmed",
          },
        ],
        policy_version: 1,
        outcome: { net_gain_usd: 1.23 },
        started_at: NOW,
        completed_at: NOW,
      })
    ).not.toThrow();
  });

  it("accepts a dry run with no tx hashes", () => {
    expect(() =>
      RunSchema.parse({
        id: UUID,
        wallet_address: WALLET,
        quote_id: null,
        mode: "dry_run",
        status: "dry_run_complete",
        tx_hashes: [],
        policy_version: 1,
        outcome: null,
        started_at: NOW,
        completed_at: NOW,
      })
    ).not.toThrow();
  });
});

describe("AgentCommandSchema", () => {
  it("parses check_yields", () => {
    const cmd = AgentCommandSchema.parse({ type: "check_yields" });
    expect(cmd.type).toBe("check_yields");
  });

  it("parses rebalance with numeric amount", () => {
    const cmd = AgentCommandSchema.parse({ type: "rebalance", amount: 100 });
    expect(cmd.type).toBe("rebalance");
    if (cmd.type === "rebalance") expect(cmd.amount).toBe(100);
  });

  it("parses rebalance with 'all'", () => {
    const cmd = AgentCommandSchema.parse({ type: "rebalance", amount: "all" });
    expect(cmd.type).toBe("rebalance");
    if (cmd.type === "rebalance") expect(cmd.amount).toBe("all");
  });

  it("parses unknown command", () => {
    const cmd = AgentCommandSchema.parse({
      type: "unknown",
      raw: "do something weird",
    });
    expect(cmd.type).toBe("unknown");
  });

  it("rejects bridge command with invalid chain", () => {
    expect(() =>
      AgentCommandSchema.parse({
        type: "bridge",
        amount: 100,
        from: "solana",
        to: "celo",
      })
    ).toThrow();
  });
});
