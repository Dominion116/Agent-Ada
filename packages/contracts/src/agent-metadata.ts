/**
 * AgentProfile is the JSON document served at GET /api/agent/profile.
 *
 * It follows the ERC-8004 agent metadata convention used by agentscan and
 * 8004scan. The profileUrl field on the registry entry must point to the
 * deployed URL of that endpoint so explorers can fetch this document.
 */

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
  /** Amount in USDC, e.g. "0.001" */
  priceUsdc: string;
  description: string;
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
        priceUsdc: "0.001",
        description: "Current cached yield data across all supported venues and chains.",
      },
      {
        path: "/api/agent/execute",
        method: "POST",
        priceUsdc: "0.10",
        description: "Execute an approved rebalance on behalf of a wallet.",
      },
    ],
    apiBaseUrl: process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "",
    agentscanUrl: null,
    scan8004Url: null,
    ...overrides,
  };
}
