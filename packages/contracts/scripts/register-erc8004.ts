/**
 * One-time ERC-8004 agent registration script.
 *
 * Run once during setup:
 *   npx tsx packages/contracts/scripts/register-erc8004.ts
 *
 * On success it prints the registry ID. Copy that value into AGENT_ERC8004_ID
 * in apps/api/.env so the profile endpoint returns it.
 *
 * ERC-8004 registry contract address:
 *   Verify the current address at https://agentscan.io or from the hackathon
 *   documentation before running. The placeholder below must be replaced.
 *
 * Required env vars (load from apps/api/.env before running):
 *   AGENT_PRIVATE_KEY
 *   CELO_RPC_URL         (defaults to https://forno.celo.org)
 *   NEXT_PUBLIC_API_BASE_URL  (the deployed backend URL for profileUrl)
 */

import { createWalletClient, createPublicClient, http, parseEventLogs } from "viem";
import { celo } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { buildAgentProfile } from "../src/agent-metadata.js";

// Replace with the verified ERC-8004 registry address on Celo mainnet.
// Check https://agentscan.io/docs or the hackathon repository for the address.
const ERC8004_REGISTRY_ADDRESS =
  (process.env["ERC8004_REGISTRY_ADDRESS"] as `0x${string}`) ??
  "0x0000000000000000000000000000000000000000";

const REGISTRY_ABI = [
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "profileUrl", type: "string" },
      { name: "capabilities", type: "string[]" },
    ],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    name: "AgentRegistered",
    type: "event",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
    ],
  },
] as const;

async function main() {
  const privateKey = process.env["AGENT_PRIVATE_KEY"];
  if (!privateKey) throw new Error("AGENT_PRIVATE_KEY is not set");

  const rpcUrl = process.env["CELO_RPC_URL"] ?? "https://forno.celo.org";
  const apiBase = process.env["NEXT_PUBLIC_API_BASE_URL"];
  if (!apiBase) throw new Error("NEXT_PUBLIC_API_BASE_URL is not set — needed for profileUrl");

  if (ERC8004_REGISTRY_ADDRESS === "0x0000000000000000000000000000000000000000") {
    throw new Error(
      "ERC8004_REGISTRY_ADDRESS is not set. " +
        "Set it via the env var or replace the placeholder in this script.",
    );
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const profile = buildAgentProfile();
  const profileUrl = `${apiBase}/api/agent/profile`;

  console.log("Registering Ada under ERC-8004...");
  console.log("  Agent wallet:", account.address);
  console.log("  Registry:", ERC8004_REGISTRY_ADDRESS);
  console.log("  Profile URL:", profileUrl);
  console.log("  Capabilities:", profile.capabilities);

  const publicClient = createPublicClient({ chain: celo, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: celo, transport: http(rpcUrl) });

  const hash = await walletClient.writeContract({
    address: ERC8004_REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: "register",
    args: [profile.name, profileUrl, profile.capabilities],
    gas: 300_000n,
  });

  console.log("  Tx hash:", hash);
  console.log("  Waiting for confirmation...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Registration transaction reverted (hash: ${hash})`);
  }

  const logs = parseEventLogs({ abi: REGISTRY_ABI, logs: receipt.logs });
  const registered = logs.find((l) => l.eventName === "AgentRegistered");

  if (!registered) {
    console.warn("Warning: AgentRegistered event not found in receipt. Check the ABI or contract.");
    console.log("Block:", receipt.blockNumber.toString());
    return;
  }

  const agentId = (registered.args as { agentId: bigint }).agentId.toString();

  console.log("\nRegistration complete.");
  console.log("  Registry ID:", agentId);
  console.log("\nNext steps:");
  console.log("  1. Add  AGENT_ERC8004_ID=" + agentId + "  to apps/api/.env");
  console.log("  2. Add  AGENT_ERC8004_ID=" + agentId + "  to apps/web/.env.local");
  console.log("  3. Verify Ada at https://agentscan.io and https://8004scan.io");
}

main().catch((err) => {
  console.error("Registration failed:", err);
  process.exit(1);
});
