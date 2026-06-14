import type { Db } from "../lib/db.js";
import { parseCommand } from "./nl-parser.js";
import { respondToCommand } from "./command-responder.js";
import { createQuote } from "./quote-service.js";
import { executeApprovedRebalance } from "./execute-service.js";
import type { Asset } from "@ada/shared";

export interface A2AMessageInput {
  /** Concatenated text from `kind: "text"` parts of the incoming A2A message. */
  text: string;
  /** The first `kind: "data"` part's `data` object, if present. */
  data?: Record<string, unknown>;
  /** Wallet bound to the caller's Bearer JWT, or null for anonymous callers. */
  walletAddress: string | null;
}

export interface A2AMessageResult {
  text: string;
  data?: Record<string, unknown>;
}

const AUTH_REQUIRED_MESSAGE =
  "This skill requires an authenticated wallet. Send a Bearer wallet JWT issued by the SIWE login flow.";

/**
 * Routes an incoming A2A `message/send` payload to Ada's agent services.
 *
 * Two invocation styles are supported:
 *  - Structured: a `data` part shaped `{"skill": "...", "input": {...}}`
 *    directly dispatches `get-rebalance-quote` / `execute-rebalance`.
 *  - Natural language: anything else is parsed by `parseCommand` and
 *    dispatched via `respondToCommand`, the same logic that powers
 *    POST /api/agent/chat (get-yields, ask-ada, check-balance,
 *    explain-last-run, and NL "rebalance <amount>").
 */
export async function handleA2AMessage(input: A2AMessageInput, db: Db): Promise<A2AMessageResult> {
  const { text, data, walletAddress } = input;
  const skill = typeof data?.["skill"] === "string" ? data["skill"] : undefined;

  if (skill === "get-rebalance-quote") {
    if (!walletAddress) return { text: AUTH_REQUIRED_MESSAGE };

    const skillInput = (data?.["input"] ?? {}) as Record<string, unknown>;
    const asset = (typeof skillInput["asset"] === "string" ? skillInput["asset"] : "USDC") as Asset;
    const amount = skillInput["amount"];
    if (typeof amount !== "string" && typeof amount !== "number") {
      return { text: "get-rebalance-quote requires input.amount (atomic units)." };
    }

    const result = await createQuote(db, walletAddress, asset, BigInt(amount));
    if (!result.ok) return { text: result.error };

    return {
      text:
        `Quote ready: ${result.route.source_venue} on ${result.route.source_chain} ` +
        `→ ${result.route.dest_venue} on ${result.route.dest_chain}, net gain ${result.route.net_gain_bps / 100}%.`,
      data: { quoteId: result.quoteId, route: result.route, approvalToken: result.approvalToken, expiresAt: result.expiresAt },
    };
  }

  if (skill === "execute-rebalance") {
    if (!walletAddress) return { text: AUTH_REQUIRED_MESSAGE };

    const skillInput = (data?.["input"] ?? {}) as Record<string, unknown>;
    const approvalToken = skillInput["approvalToken"];
    if (typeof approvalToken !== "string") {
      return { text: "execute-rebalance requires input.approvalToken." };
    }

    const result = await executeApprovedRebalance(db, walletAddress, approvalToken);
    if (!result.ok) return { text: result.error };

    return {
      text: `Run ${result.run.id} ${result.run.status}.`,
      data: { run: result.run },
    };
  }

  const cmd = await parseCommand(text, walletAddress ?? "anonymous");
  const { text: responseText, payload } = await respondToCommand(cmd, text, walletAddress, db);
  return payload ? { text: responseText, data: payload } : { text: responseText };
}
