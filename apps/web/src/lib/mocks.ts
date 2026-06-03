import type {
  ChatMessage,
  Policy,
  PolicyUpdate,
  Quote,
  Route,
  Run,
  YieldData,
} from "@ada/shared";
import type { ApiClient } from "@/lib/api";

/**
 * Mock data layer. When NEXT_PUBLIC_USE_MOCKS=true, `api` is swapped for
 * `mockApi` so the dashboard renders populated without a running backend.
 * Fixtures are typed against @ada/shared and use relative timestamps so
 * countdowns and relative times stay alive between reloads.
 */

const WALLET = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

// Quotes rejected during this session, so the Approvals list reflects the action.
const rejected = new Set<string>();

const now = () => Date.now();
const iso = (msFromNow: number) => new Date(now() + msFromNow).toISOString();
const mins = (m: number) => m * 60_000;
const hours = (h: number) => h * 3_600_000;

// Small delay so loading skeletons get a moment to show, like a real network.
const delay = <T>(value: T, ms = 350): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

// A throwaway 0x hash for tx detail links.
function hash(seed: string): string {
  const hex = Array.from(seed.padEnd(64, "0"))
    .map((c) => (c.charCodeAt(0) % 16).toString(16))
    .join("")
    .slice(0, 64);
  return `0x${hex}`;
}

// ── Yields ─────────────────────────────────────────────────────

const YIELDS: YieldData[] = [
  { chain: "base", venue: "aave-v3", asset: "USDC", supply_rate_bps: 640, utilisation_bps: 7200, last_updated: iso(-mins(2)) },
  { chain: "arbitrum", venue: "aave-v3", asset: "USDC", supply_rate_bps: 595, utilisation_bps: 6800, last_updated: iso(-mins(2)) },
  { chain: "celo", venue: "moola", asset: "cUSD", supply_rate_bps: 513, utilisation_bps: 6100, last_updated: iso(-mins(1)) },
  { chain: "optimism", venue: "aave-v3", asset: "USDC", supply_rate_bps: 510, utilisation_bps: 6400, last_updated: iso(-mins(3)) },
  { chain: "celo", venue: "moola", asset: "USDC", supply_rate_bps: 482, utilisation_bps: 6500, last_updated: iso(-mins(1)) },
  { chain: "polygon", venue: "aave-v3", asset: "USDC", supply_rate_bps: 420, utilisation_bps: 5900, last_updated: iso(-mins(4)) },
];

// ── Balances ───────────────────────────────────────────────────

const BALANCES = [
  { asset: "USDC", raw: "12500000000", decimals: 6, formatted: "12,500.00" },
  { asset: "cUSD", raw: "3200000000000000000000", decimals: 18, formatted: "3,200.00" },
];

// ── Quotes (pending approvals) ─────────────────────────────────

function mockQuotes(): Quote[] {
  return [
    {
      id: "11111111-1111-4111-8111-111111111111",
      wallet_address: WALLET,
      source_chain: "celo",
      source_venue: "moola",
      dest_chain: "base",
      dest_venue: "aave-v3",
      asset: "USDC",
      amount: "12500000000",
      route_cost_bps: 35,
      net_gain_bps: 158,
      payback_days: 9,
      policy_version: 3,
      approval_token: "mock-approval-token-1",
      expires_at: iso(mins(4) + 30_000),
      created_at: iso(-mins(1)),
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      wallet_address: WALLET,
      source_chain: "celo",
      source_venue: "moola",
      dest_chain: "arbitrum",
      dest_venue: "aave-v3",
      asset: "USDC",
      amount: "5000000000",
      route_cost_bps: 28,
      net_gain_bps: 82,
      payback_days: 21,
      policy_version: 3,
      approval_token: "mock-approval-token-2",
      expires_at: iso(mins(8)),
      created_at: iso(-mins(2)),
    },
  ];
}

// ── Runs ───────────────────────────────────────────────────────

function routeOutcome(over: Partial<Route>): { route: Partial<Route> } {
  return {
    route: {
      source_chain: "celo",
      source_venue: "moola",
      dest_chain: "base",
      dest_venue: "aave-v3",
      asset: "USDC",
      amount_in: "12500000000",
      amount_out: "12480000000",
      ...over,
    },
  };
}

function mockRuns(): Run[] {
  return [
    {
      id: "aaaaaaaa-0001-4000-8000-000000000001",
      wallet_address: WALLET,
      quote_id: "11111111-1111-4111-8111-111111111111",
      mode: "live",
      status: "completed",
      tx_hashes: [
        { step: "withdraw", hash: hash("withdraw-1"), block_number: 28104551, status: "confirmed" },
        { step: "bridge", hash: hash("bridge-1"), block_number: 19887210, status: "confirmed" },
        { step: "supply", hash: hash("supply-1"), block_number: 19887402, status: "confirmed" },
      ],
      policy_version: 3,
      outcome: routeOutcome({}),
      started_at: iso(-hours(2)),
      completed_at: iso(-hours(2) + 48_000),
    },
    {
      id: "aaaaaaaa-0002-4000-8000-000000000002",
      wallet_address: WALLET,
      quote_id: null,
      mode: "dry_run",
      status: "dry_run_complete",
      tx_hashes: [],
      policy_version: 3,
      outcome: routeOutcome({ dest_chain: "arbitrum", amount_in: "5000000000", amount_out: "4992000000" }),
      started_at: iso(-hours(5)),
      completed_at: iso(-hours(5) + 4_000),
    },
    {
      id: "aaaaaaaa-0003-4000-8000-000000000003",
      wallet_address: WALLET,
      quote_id: "33333333-3333-4333-8333-333333333333",
      mode: "live",
      status: "failed",
      tx_hashes: [
        { step: "withdraw", hash: hash("withdraw-3"), block_number: 28091122, status: "confirmed" },
        { step: "bridge", hash: hash("bridge-3"), block_number: null, status: "reverted" },
      ],
      policy_version: 2,
      outcome: { ...routeOutcome({ dest_chain: "polygon" }), error: "Bridge step reverted: insufficient liquidity on destination" },
      started_at: iso(-hours(26)),
      completed_at: iso(-hours(26) + 31_000),
    },
    {
      id: "aaaaaaaa-0004-4000-8000-000000000004",
      wallet_address: WALLET,
      quote_id: "44444444-4444-4444-8444-444444444444",
      mode: "live",
      status: "executing",
      tx_hashes: [
        { step: "withdraw", hash: hash("withdraw-4"), block_number: 28110980, status: "confirmed" },
        { step: "supply", hash: null, block_number: null, status: "pending" },
      ],
      policy_version: 3,
      outcome: routeOutcome({ dest_chain: "celo", dest_venue: "moola", amount_in: "3200000000000000000000", asset: "cUSD" }),
      started_at: iso(-mins(2)),
      completed_at: null,
    },
    {
      id: "aaaaaaaa-0005-4000-8000-000000000005",
      wallet_address: WALLET,
      quote_id: null,
      mode: "dry_run",
      status: "dry_run_complete",
      tx_hashes: [],
      policy_version: 2,
      outcome: routeOutcome({ dest_chain: "optimism" }),
      started_at: iso(-hours(50)),
      completed_at: iso(-hours(50) + 3_000),
    },
    {
      id: "aaaaaaaa-0006-4000-8000-000000000006",
      wallet_address: WALLET,
      quote_id: "66666666-6666-4666-8666-666666666666",
      mode: "live",
      status: "completed",
      tx_hashes: [
        { step: "withdraw", hash: hash("withdraw-6"), block_number: 27990012, status: "confirmed" },
        { step: "supply", hash: hash("supply-6"), block_number: 27990119, status: "confirmed" },
      ],
      policy_version: 1,
      outcome: routeOutcome({ dest_chain: "celo", dest_venue: "aave-v3", amount_out: "12495000000" }),
      started_at: iso(-hours(72)),
      completed_at: iso(-hours(72) + 22_000),
    },
  ];
}

// ── Policy ─────────────────────────────────────────────────────

let POLICY: Policy = {
  id: "99999999-9999-4999-8999-999999999999",
  wallet_address: WALLET,
  version: 3,
  min_net_gain_bps: 50,
  max_route_cost_bps: 150,
  cooldown_hours: 24,
  allowed_chains: ["celo", "base", "arbitrum"],
  allowed_venues: ["moola", "aave-v3"],
  kill_switch: false,
  created_at: iso(-hours(20)),
};

// ── Chat ───────────────────────────────────────────────────────

const CHAT: ChatMessage[] = [
  {
    id: "cccccccc-0001-4000-8000-000000000001",
    wallet_address: WALLET,
    role: "user",
    content: "What yields are available right now?",
    payload: null,
    created_at: iso(-mins(12)),
  },
  {
    id: "cccccccc-0002-4000-8000-000000000002",
    wallet_address: WALLET,
    role: "assistant",
    content:
      "The strongest right now is Aave V3 on Base at 6.40% for USDC. Your Moola position on Celo is at 4.82%, so a move could add about 1.58% after fees.",
    payload: null,
    created_at: iso(-mins(12) + 4_000),
  },
];

// Intent-aware canned chat replies. Rebalance-style prompts return a payload
// carrying a route so the inline QuoteCard path is demonstrable with mocks on.
function chatReply(message: string): { response: string; command: unknown; payload: unknown } {
  const m = message.toLowerCase();

  if (/yield|apr|rate/.test(m)) {
    return {
      response:
        "The strongest right now is Aave V3 on Base at 6.40% for USDC. Your Moola position on Celo is at 4.82%, so a move could add about 1.58% after fees.",
      command: { type: "check_yields" },
      payload: null,
    };
  }

  if (/balance|holding|how much/.test(m)) {
    return {
      response: "You are holding 12,500.00 USDC and 3,200.00 cUSD on Celo.",
      command: { type: "check_balance" },
      payload: null,
    };
  }

  if (/rebalance|move|save|put.*work/.test(m)) {
    return {
      response:
        "I found a move that passes your policy: shift your USDC from Moola on Celo to Aave V3 on Base for about 1.58% more after fees. Review and approve below.",
      command: { type: "rebalance", amount: "all" },
      payload: {
        kind: "quote",
        expiresAt: iso(mins(5)),
        route: {
          source_chain: "celo",
          source_venue: "moola",
          dest_chain: "base",
          dest_venue: "aave-v3",
          asset: "USDC",
          amount_in: "12500000000",
          amount_out: "12480000000",
          route_cost_bps: 35,
          net_gain_bps: 158,
          payback_days: 9,
          estimated_time_seconds: 95,
          lifi_route: null,
        },
      },
    };
  }

  if (/last run|what happened|explain/.test(m)) {
    return {
      response:
        "Your last live run completed about 2 hours ago. It moved 12,500 USDC from Moola on Celo to Aave V3 on Base across three confirmed transactions.",
      command: { type: "explain_last_run" },
      payload: null,
    };
  }

  return {
    response:
      "I can check yields, report your balance, propose a rebalance, or explain your last run. Try one of the suggestions below.",
    command: { type: "unknown" },
    payload: null,
  };
}

// ── Mock API surface ───────────────────────────────────────────

export const mockApi: ApiClient = {
  yields: () => delay({ yields: YIELDS, cachedAt: iso(-mins(1)) }),

  balance: () => delay({ balances: BALANCES }),

  quotes: () => delay({ quotes: mockQuotes().filter((q) => !rejected.has(q.id)) }),

  rejectQuote: (quoteId: string) => {
    rejected.add(quoteId);
    return delay({ ok: true }, 200);
  },

  quote: (amount: string, asset: "cUSD" | "USDC" = "USDC") =>
    delay({
      quoteId: "00000000-0000-4000-8000-000000000abc",
      route: {
        source_chain: "celo",
        source_venue: "moola",
        dest_chain: "base",
        dest_venue: "aave-v3",
        asset,
        amount_in: amount === "all" ? "12500000000" : amount,
        amount_out: "12480000000",
        route_cost_bps: 35,
        net_gain_bps: 158,
        payback_days: 9,
        estimated_time_seconds: 95,
        lifi_route: null,
      },
      approvalToken: "mock-approval-token-new",
      expiresAt: iso(mins(5)),
    }),

  execute: (_approvalToken: string) => delay({ run: mockRuns()[0]! }, 600),

  runs: (limit = 20, offset = 0) =>
    delay({ runs: mockRuns().slice(offset, offset + limit) }),

  run: (id: string) =>
    delay({ run: mockRuns().find((r) => r.id === id) ?? mockRuns()[0]! }),

  getPolicy: () => delay({ policy: POLICY }),

  updatePolicy: (policy: PolicyUpdate) => {
    POLICY = { ...POLICY, ...policy, version: POLICY.version + 1, created_at: iso(0) };
    return delay({ policy: POLICY });
  },

  sendChat: (message: string) => delay(chatReply(message), 700),

  chatHistory: () => delay({ messages: CHAT }),

  saveTelegram: (_bot_token: string, _chat_id: string, _events: string[]) =>
    delay({ ok: true }, 300),

  profile: () =>
    delay({
      name: "Ada",
      erc8004RegistryId: "8004:celo:42",
      selfAgentId: "self:agent:ada-001",
      chains: ["celo", "base", "polygon", "arbitrum", "optimism"],
    }),

  deleteAllData: () => delay({ ok: true }, 400),
};
