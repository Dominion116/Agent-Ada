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
        asset: CELO_USDC_ADDRESS,
      },
      {
        path: "/api/agent/execute",
        method: "POST",
        priceUsdc: X402_PRICES.execute.replace("$", ""),
        description: "Execute an approved rebalance on behalf of a wallet.",
        network: process.env["X402_NETWORK"] ?? CELO_MAINNET_NETWORK,
        asset: CELO_USDC_ADDRESS,
      },
    ],
    apiBaseUrl: process.env["API_BASE_URL"] ?? process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "",
    // agentscan.info assigns its own opaque per-agent IDs we can't derive from
    // the registry tokenId, so this stays null until the agent is indexed there.
    agentscanUrl: null,
    scan8004Url: process.env["AGENT_ERC8004_ID"]
      ? `https://8004scan.io/agents/celo/${process.env["AGENT_ERC8004_ID"]}`
      : null,
    ...overrides,
  };
}
