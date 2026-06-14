import type { AgentCommand, Run } from "@ada/shared";
import { getRuns, type Db } from "../lib/db.js";
import { getYields } from "./yield-discovery.js";
import { composeExplanation, composeFreeformReply } from "./nl-parser.js";
import { createQuote } from "./quote-service.js";
import { ASSET_DECIMALS } from "../onchain/celo-client.js";

export interface CommandResponse {
  text: string;
  payload: Record<string, unknown> | null;
}

const CONNECT_WALLET_MESSAGE =
  "Connect a wallet to use this, including an Authorization: Bearer <jwt> from the SIWE login flow.";

/**
 * Dispatches a parsed `AgentCommand` to the underlying agent services and
 * composes a reply. Shared by POST /api/agent/chat and the A2A `ask-ada` and
 * NL-driven skills. `walletAddress` is `null` for anonymous A2A callers.
 */
export async function respondToCommand(
  cmd: AgentCommand,
  rawMessage: string,
  walletAddress: string | null,
  db: Db,
): Promise<CommandResponse> {
  if (cmd.type === "check_yields") {
    const yields = await getYields().catch(() => []);
    const text = yields.length
      ? `Found ${yields.length} yield sources. Best USDC: ${Math.max(...yields.map((y) => y.supply_rate_bps)) / 100}% APR.`
      : "Unable to fetch yields right now.";
    return { text, payload: { yields } };
  }

  if (cmd.type === "check_balance") {
    if (!walletAddress) return { text: CONNECT_WALLET_MESSAGE, payload: null };
    const { getAllStablecoinBalances } = await import("../onchain/celo-client.js");
    const balances = await getAllStablecoinBalances(walletAddress as `0x${string}`);
    return {
      text: "Check the dashboard for your current balance across all supported chains.",
      payload: { balances: balances.map((b) => ({ ...b, raw: b.raw.toString() })) },
    };
  }

  if (cmd.type === "explain_last_run") {
    if (!walletAddress) return { text: CONNECT_WALLET_MESSAGE, payload: null };
    const [lastRun] = await getRuns(db, walletAddress, { limit: 1 });
    if (!lastRun) return { text: "No runs found yet.", payload: null };
    const text = await composeExplanation(lastRun as unknown as Run).catch(() => `Last run status: ${lastRun.status}`);
    return { text, payload: { run: lastRun } };
  }

  if (cmd.type === "rebalance") {
    if (!walletAddress) return { text: CONNECT_WALLET_MESSAGE, payload: null };

    if (typeof cmd.amount === "number") {
      const amountIn = BigInt(Math.round(cmd.amount * 10 ** ASSET_DECIMALS["USDC"]));
      const result = await createQuote(db, walletAddress, "USDC", amountIn);
      if (!result.ok) return { text: result.error, payload: null };

      return {
        text:
          `Found a rebalance route: ${result.route.source_venue} on ${result.route.source_chain} ` +
          `→ ${result.route.dest_venue} on ${result.route.dest_chain}, ` +
          `net gain ${result.route.net_gain_bps / 100}%. Approval token valid until ${result.expiresAt}.`,
        payload: { quoteId: result.quoteId, route: result.route, approvalToken: result.approvalToken, expiresAt: result.expiresAt },
      };
    }

    return {
      text: `Understood. Use the Approvals page or send a quote request to start a rebalance of ${cmd.amount} USDC.`,
      payload: null,
    };
  }

  const text = cmd.type === "unknown" ? cmd.raw : rawMessage;
  return { text: await composeFreeformReply(text), payload: null };
}
