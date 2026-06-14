/**
 * AgentProfile is the JSON document served at GET /api/agent/profile.
 *
 * It follows the ERC-8004 agent metadata convention used by agentscan and
 * 8004scan. The profileUrl field on the registry entry must point to the
 * deployed URL of that endpoint so explorers can fetch this document.
 */

import { CELO_MAINNET_NETWORK, CELO_CUSD_ADDRESS, X402_PRICES } from "./x402-config.js";

export interface AgentProfile {
  name: string;
  description: string;
  version: string;
  /** Stable identifier assigned by the ERC-8004 registry after registration. */
  erc8004RegistryId: string | null;
  /** Verified credential from the Self protocol. Null until verified. */
  selfAgentId: string | null;
  capabilities: AgentCapability[];
  chains: string[];
  assets: string[];
  /** Endpoints that require x402 payment before responding. */
  x402Endpoints: X402EndpointInfo[];
  /** Public URL of the deployed backend API. */
  apiBaseUrl: string;
  /** Link to the agent's activity page on agentscan. */
  agentscanUrl: string | null;
  /** Link to the agent's activity page on 8004scan. */
  scan8004Url: string | null;
  /** A2A (Agent2Agent) Agent Card describing Ada's skills and JSON-RPC endpoint. */
  a2aCardUrl: string;
}

export type AgentCapability =
  | "yield-discovery"
  | "route-comparison"
  | "rebalance-execution"
  | "policy-enforcement"
  | "telegram-notifications"
  | "nl-command-parsing";

export interface X402EndpointInfo {
  path: string;
  method: "GET" | "POST";
  /** Amount in cUSD, e.g. "0.001" */
  priceUsdc: string;
  description: string;
  /** CAIP-2 chain id payment is settled on. */
  network: string;
  /** Token contract address payment is collected in. */
  asset: `0x${string}`;
}

/** Default profile populated at startup; mutable fields are set after
 *  ERC-8004 registration and Self verification complete. */
export function buildAgentProfile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    name: "Ada",
    description:
      "Autonomous stablecoin treasury agent on Celo. " +
      "Discovers yield, prices cross-chain rebalances, and executes under user policy.",
    version: "1.0.0",
    erc8004RegistryId: process.env["AGENT_ERC8004_ID"] ?? null,
    selfAgentId: process.env["AGENT_SELF_ID"] ?? null,
    capabilities: [
      "yield-discovery",
      "route-comparison",
      "rebalance-execution",
      "policy-enforcement",
      "telegram-notifications",
      "nl-command-parsing",
    ],
    chains: ["celo", "base", "polygon", "arbitrum", "optimism"],
    assets: ["cUSD", "USDC"],
    x402Endpoints: [
      {
        path: "/api/agent/yields",
        method: "GET",
        priceUsdc: X402_PRICES.yields.replace("$", ""),
        description: "Current cached yield data across all supported venues and chains.",
        network: process.env["X402_NETWORK"] ?? CELO_MAINNET_NETWORK,
        asset: CELO_CUSD_ADDRESS,
      },
      {
        path: "/api/agent/execute",
        method: "POST",
        priceUsdc: X402_PRICES.execute.replace("$", ""),
        description: "Execute an approved rebalance on behalf of a wallet.",
        network: process.env["X402_NETWORK"] ?? CELO_MAINNET_NETWORK,
        asset: CELO_CUSD_ADDRESS,
      },
      {
        path: "/a2a",
        method: "POST",
        priceUsdc: X402_PRICES.a2a.replace("$", ""),
        description: "A2A JSON-RPC endpoint (message/send). Free for authenticated wallet sessions.",
        network: process.env["X402_NETWORK"] ?? CELO_MAINNET_NETWORK,
        asset: CELO_CUSD_ADDRESS,
      },
    ],
    apiBaseUrl: process.env["API_BASE_URL"] ?? process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "",
    agentscanUrl: "https://agentscan.info/agents/e9027671-0c92-4c1e-8a86-9f19a0457cf5",
    scan8004Url: process.env["AGENT_ERC8004_ID"]
      ? `https://8004scan.io/agents/celo/${process.env["AGENT_ERC8004_ID"]}`
      : null,
    a2aCardUrl: `${process.env["API_BASE_URL"] ?? process.env["NEXT_PUBLIC_API_BASE_URL"] ?? ""}/.well-known/agent-card.json`,
    ...overrides,
  };
}

// ── A2A (Agent2Agent protocol) ──────────────────────────────────
//
// Served at GET /.well-known/agent-card.json (and the legacy
// /.well-known/agent.json alias). Other agents fetch this card to discover
// Ada's skills, then call POST /a2a with JSON-RPC `message/send`.

export interface A2ASecurityScheme {
  type: "http";
  scheme: "bearer";
  bearerFormat?: string;
}

export interface A2ASkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
  /** Security requirements for this skill. Empty/omitted means publicly callable. */
  security?: Record<string, string[]>[];
}

export interface A2AAgentCard {
  protocolVersion: string;
  name: string;
  description: string;
  /** URL of the JSON-RPC endpoint (POST /a2a). */
  url: string;
  preferredTransport: string;
  version: string;
  provider?: { organization: string; url: string };
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory: boolean;
  };
  securitySchemes: Record<string, A2ASecurityScheme>;
  security: Record<string, string[]>[];
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: A2ASkill[];
}

/**
 * Auth-required skills require the same Bearer wallet JWT used by the
 * dashboard (issued via SIWE at POST /api/auth/verify). Anonymous callers can
 * still use the public skills, subject to the x402 gate on POST /a2a.
 */
const AUTH_REQUIRED: Record<string, string[]>[] = [{ bearerAuth: [] }];

export const A2A_SKILLS: A2ASkill[] = [
  {
    id: "get-yields",
    name: "Get current yields",
    description:
      "Current supply rates across Moola (Celo) and Aave V3 (Base, Optimism, Arbitrum, Polygon) for cUSD and USDC.",
    tags: ["defi", "yield", "celo"],
    examples: ["check yields", "What's the best USDC yield right now?"],
    inputModes: ["text/plain"],
    outputModes: ["text/plain", "application/json"],
  },
  {
    id: "ask-ada",
    name: "Ask Ada",
    description: "General natural-language conversation about what Ada does and how the agent works.",
    tags: ["chat", "nl"],
    examples: ["What can you do?", "hello"],
    inputModes: ["text/plain"],
    outputModes: ["text/plain"],
  },
  {
    id: "get-rebalance-quote",
    name: "Get rebalance quote",
    description:
      'Scans current yields, prices a rebalance for the authenticated wallet, and returns a signed approval token valid for 5 minutes. ' +
      'Invoke as natural language ("rebalance 100 USDC") or as a structured data part: ' +
      '{"skill":"get-rebalance-quote","input":{"amount":"<atomic units>","asset":"USDC"}}.',
    tags: ["defi", "rebalance", "quote"],
    examples: ["rebalance 100 USDC"],
    inputModes: ["text/plain", "application/json"],
    outputModes: ["application/json"],
    security: AUTH_REQUIRED,
  },
  {
    id: "execute-rebalance",
    name: "Execute rebalance",
    description:
      'Executes a previously approved rebalance quote on-chain. Invoke as a structured data part: ' +
      '{"skill":"execute-rebalance","input":{"approvalToken":"<jwt from get-rebalance-quote>"}}.',
    tags: ["defi", "rebalance", "execute"],
    inputModes: ["application/json"],
    outputModes: ["application/json"],
    security: AUTH_REQUIRED,
  },
  {
    id: "check-balance",
    name: "Check balance",
    description: "cUSD and USDC balances on Celo mainnet for the authenticated wallet.",
    tags: ["wallet", "balance"],
    examples: ["check balance"],
    inputModes: ["text/plain"],
    outputModes: ["application/json"],
    security: AUTH_REQUIRED,
  },
  {
    id: "explain-last-run",
    name: "Explain last run",
    description: "Plain-language explanation of the authenticated wallet's most recent rebalance run.",
    tags: ["history", "runs"],
    examples: ["explain last run"],
    inputModes: ["text/plain"],
    outputModes: ["text/plain", "application/json"],
    security: AUTH_REQUIRED,
  },
];

/** Builds the A2A Agent Card served at /.well-known/agent-card.json. */
export function buildAgentCard(overrides: Partial<A2AAgentCard> = {}): A2AAgentCard {
  const apiBaseUrl = process.env["API_BASE_URL"] ?? process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "";

  return {
    protocolVersion: "0.3.0",
    name: "Ada",
    description:
      "Autonomous stablecoin treasury agent on Celo. " +
      "Discovers yield, prices cross-chain rebalances, and executes under user policy.",
    url: `${apiBaseUrl}/a2a`,
    preferredTransport: "JSONRPC",
    version: "1.0.0",
    provider: { organization: "Agent Ada", url: apiBaseUrl },
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    security: [],
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills: A2A_SKILLS,
    ...overrides,
  };
}
