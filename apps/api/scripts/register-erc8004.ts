/**
 * One-time script: registers Agent Ada in the ERC-8004 Identity Registry on
 * Celo mainnet and prints the resulting AGENT_ERC8004_ID.
 *
 * Usage (from apps/api directory):
 *   npx tsx --env-file .env scripts/register-erc8004.ts
 *
 * After it completes, paste the printed ID into .env:
 *   AGENT_ERC8004_ID=<printed value>
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
} from "viem";
import { celo } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// ── ERC-8004 Identity Registry on Celo mainnet ────────────────
const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;

const ABI = parseAbi([
  "function register(string calldata agentURI) external returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

// ── Agent metadata hosted on Vercel ──────────────────────────
const AGENT_URI = "https://agent-ada-web.vercel.app/agent.json";

async function main() {
  const privateKey = process.env["AGENT_PRIVATE_KEY"];
  const rpcUrl = process.env["CELO_RPC_URL"] ?? "https://forno.celo.org";

  if (!privateKey) {
    console.error("AGENT_PRIVATE_KEY is not set");
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log("Agent wallet:", account.address);
  console.log("Registering with URI:", AGENT_URI);

  const publicClient = createPublicClient({ chain: celo, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: celo, transport: http(rpcUrl) });

  // ── Check wallet has gas ──────────────────────────────────
  const balance = await publicClient.getBalance({ address: account.address });
  console.log("CELO balance:", Number(balance) / 1e18, "CELO");
  if (balance === 0n) {
    console.error("Wallet has no CELO. Fund it at https://faucet.celo.org then retry.");
    process.exit(1);
  }

  // ── Submit registration ───────────────────────────────────
  console.log("Submitting registration transaction...");
  const hash = await walletClient.writeContract({
    address: IDENTITY_REGISTRY,
    abi: ABI,
    functionName: "register",
    args: [AGENT_URI],
  });
  console.log("Tx hash:", hash);
  console.log("Waiting for confirmation...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("Confirmed in block:", receipt.blockNumber.toString());

  // ── Parse Transfer event to get tokenId ──────────────────
  // ERC-721 mint: Transfer(address(0), agent_wallet, tokenId)
  const zeroAddress = "0x0000000000000000000000000000000000000000";
  const transferLog = receipt.logs.find(
    (log) =>
      log.address.toLowerCase() === IDENTITY_REGISTRY.toLowerCase() &&
      log.topics[1]?.toLowerCase() === `0x${zeroAddress.slice(2).padStart(64, "0")}`,
  );

  if (!transferLog) {
    console.error("Could not find Transfer event in receipt. Logs:", receipt.logs);
    process.exit(1);
  }

  // tokenId is topics[3] (indexed Transfer: from, to, tokenId)
  const tokenId = BigInt(transferLog.topics[3] as `0x${string}`);
  console.log("\n✓ Registration complete");
  console.log("─────────────────────────────────");
  console.log(`AGENT_ERC8004_ID=${tokenId.toString()}`);
  console.log("─────────────────────────────────");
  console.log("Add the line above to apps/api/.env");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
