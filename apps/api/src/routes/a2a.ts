import { Router } from "express";
import { randomUUID } from "crypto";
import { buildAgentCard, X402_PRICES } from "@ada/contracts";
import { getDb } from "../lib/db.js";
import { createX402Middleware } from "../middleware/x402.js";
import { freeForOwnSession } from "../middleware/free-for-own-session.js";
import { handleA2AMessage } from "../agent/a2a-handler.js";
import { logger } from "../lib/logger.js";

const router = Router();

/**
 * @swagger
 * /.well-known/agent-card.json:
 *   get:
 *     tags: [A2A]
 *     summary: A2A Agent Card
 *     description: Describes Ada's skills, the A2A JSON-RPC endpoint (POST /a2a), and required auth. Public, no auth required.
 *     security: []
 *     responses:
 *       200:
 *         description: Agent Card
 */
router.get("/.well-known/agent-card.json", (_req, res) => {
  res.json(buildAgentCard());
});

// Legacy path used by pre-0.3 A2A clients, same document.
router.get("/.well-known/agent.json", (_req, res) => {
  res.json(buildAgentCard());
});

/**
 * @swagger
 * /a2a:
 *   post:
 *     tags: [A2A]
 *     summary: A2A JSON-RPC endpoint (message/send)
 *     description: >
 *       Accepts a JSON-RPC 2.0 `message/send` request and returns an A2A `Message`.
 *       A valid Bearer wallet JWT (from the SIWE login flow) makes the call free and
 *       unlocks wallet-authenticated skills (get-rebalance-quote, execute-rebalance,
 *       check-balance, explain-last-run); anonymous callers can use the public skills
 *       (get-yields, ask-ada), subject to the x402 gate at $0.001 per call.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [jsonrpc, id, method, params]
 *             properties:
 *               jsonrpc: { type: string, example: "2.0" }
 *               id: { type: string, example: "1" }
 *               method: { type: string, example: "message/send" }
 *               params:
 *                 type: object
 *                 properties:
 *                   message:
 *                     type: object
 *                     properties:
 *                       role: { type: string, example: user }
 *                       kind: { type: string, example: message }
 *                       messageId: { type: string }
 *                       parts:
 *                         type: array
 *                         items: { type: object }
 *     responses:
 *       200:
 *         description: JSON-RPC response (result or error)
 *       402:
 *         description: Payment required (x402). Response body lists accepted payment methods.
 */
router.post(
  "/a2a",
  freeForOwnSession(
    createX402Middleware({
      price: X402_PRICES.a2a,
      description: "A2A JSON-RPC endpoint (message/send).",
      endpoint: "POST /a2a",
    }),
  ),
  async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const id = (body["id"] ?? null) as string | number | null;

    if (body["jsonrpc"] !== "2.0" || typeof body["method"] !== "string") {
      res.json({ jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid Request" } });
      return;
    }

    if (body["method"] !== "message/send") {
      res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
      return;
    }

    const params = body["params"] as Record<string, unknown> | undefined;
    const message = params?.["message"] as Record<string, unknown> | undefined;
    const parts = Array.isArray(message?.["parts"]) ? (message["parts"] as Record<string, unknown>[]) : null;
    if (!message || !parts) {
      res.json({ jsonrpc: "2.0", id, error: { code: -32602, message: "Invalid params" } });
      return;
    }

    const text = parts
      .filter((p) => p["kind"] === "text" && typeof p["text"] === "string")
      .map((p) => p["text"] as string)
      .join("\n");

    const dataPart = parts.find((p) => p["kind"] === "data" && typeof p["data"] === "object" && p["data"] !== null);
    const data = dataPart ? (dataPart["data"] as Record<string, unknown>) : undefined;

    try {
      const result = await handleA2AMessage(
        { text, walletAddress: req.walletAddress ?? null, ...(data ? { data } : {}) },
        getDb(),
      );

      const responseParts: Record<string, unknown>[] = [{ kind: "text", text: result.text }];
      if (result.data) responseParts.push({ kind: "data", data: result.data });

      res.json({
        jsonrpc: "2.0",
        id,
        result: {
          role: "agent",
          kind: "message",
          messageId: randomUUID(),
          parts: responseParts,
          ...(typeof message["contextId"] === "string" ? { contextId: message["contextId"] } : {}),
        },
      });
    } catch (err) {
      logger.error({ err }, "a2a: message/send failed");
      res.json({ jsonrpc: "2.0", id, error: { code: -32603, message: "Internal error" } });
    }
  },
);

export default router;
