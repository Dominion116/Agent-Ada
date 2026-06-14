import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getDb, getLatestPolicy, getRuns, getQuotes, deleteQuote, getChatHistory, getTelegramConfig, upsertUser } from "../lib/db.js";
import { encrypt } from "../lib/crypto.js";
import { getYields } from "../agent/yield-discovery.js";
import { createQuote } from "../agent/quote-service.js";
import { executeApprovedRebalance } from "../agent/execute-service.js";
import { respondToCommand } from "../agent/command-responder.js";
import { parseCommand } from "../agent/nl-parser.js";
import { handleTelegramWebhook } from "../telegram/handler.js";
import { buildAgentProfile, X402_PRICES } from "@ada/contracts";
import { PolicyUpdateSchema, TelegramConfigInputSchema, ChatInputSchema, QuoteRequestSchema } from "@ada/shared";
import { createX402Middleware } from "../middleware/x402.js";
import { freeForOwnSession } from "../middleware/free-for-own-session.js";
import { logger } from "../lib/logger.js";
import type { Asset } from "@ada/shared";

const router = Router();

/**
 * @swagger
 * /api/agent/profile:
 *   get:
 *     tags: [Agent]
 *     summary: Agent identity and capability profile
 *     description: Returns Ada's ERC-8004 identity, supported chains, assets, and x402 endpoint pricing. Public — no auth required.
 *     security: []
 *     responses:
 *       200:
 *         description: Agent profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name: { type: string, example: Ada }
 *                 version: { type: string, example: "1.0.0" }
 *                 erc8004RegistryId: { type: string, example: "9230" }
 *                 capabilities: { type: array, items: { type: string } }
 *                 chains: { type: array, items: { type: string } }
 *                 assets: { type: array, items: { type: string } }
 */
router.get("/agent/profile", (_req, res) => {
  res.json(buildAgentProfile());
});

/**
 * @swagger
 * /api/agent/yields:
 *   get:
 *     tags: [Agent]
 *     summary: Live yield data across all supported venues
 *     description: Returns current supply rates from Moola (Celo) and Aave V3 (Optimism, Base, Polygon, Arbitrum). Metered via x402 at $0.001 per call. Public — no auth required.
 *     security: []
 *     responses:
 *       200:
 *         description: Yield data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 yields:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       chain: { type: string, example: celo }
 *                       venue: { type: string, example: moola }
 *                       asset: { type: string, example: cUSD }
 *                       supply_rate_bps: { type: integer, example: 234 }
 *                       utilisation_bps: { type: integer, example: 7657 }
 *                 cachedAt: { type: string, format: date-time }
 *       402:
 *         description: Payment required (x402). Response body lists accepted payment methods.
 */
router.get(
  "/agent/yields",
  freeForOwnSession(
    createX402Middleware({
      price: X402_PRICES.yields,
      description: "Current cached yield data across all supported venues and chains.",
      endpoint: "GET /api/agent/yields",
    }),
  ),
  async (_req, res, next) => {
    try {
      const yields = await getYields();
      res.json({ yields, cachedAt: new Date().toISOString() });
    } catch (err) { next(err); }
  },
);

/**
 * @swagger
 * /api/agent/balance:
 *   get:
 *     tags: [Agent]
 *     summary: Stablecoin balances for the authenticated wallet
 *     description: Reads cUSD and USDC ERC-20 balances on Celo mainnet for the session wallet.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Wallet balances
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 balances:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       asset: { type: string, example: cUSD }
 *                       raw: { type: string, example: "1000000000000000000" }
 *                       decimals: { type: integer, example: 18 }
 *                       formatted: { type: string, example: "1.0" }
 *       401:
 *         description: Missing or invalid JWT
 */
router.get("/agent/balance", requireAuth, async (req, res, next) => {
  try {
    const { getAllStablecoinBalances } = await import("../onchain/celo-client.js");
    const balances = await getAllStablecoinBalances(req.walletAddress as `0x${string}`);
    // `raw` is a bigint, which JSON.stringify can't serialize on its own.
    res.json({ balances: balances.map((b) => ({ ...b, raw: b.raw.toString() })) });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/agent/quote:
 *   post:
 *     tags: [Agent]
 *     summary: Request a rebalance quote
 *     description: Scans current yields, prices the cross-chain route via LI.FI, validates against the wallet's policy, and returns a signed approval token valid for 5 minutes.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount: { type: string, description: "Amount in atomic units (wei for cUSD, 1e6 for USDC)", example: "1000000000000000000" }
 *               asset: { type: string, enum: [cUSD, USDC], default: USDC }
 *     responses:
 *       200:
 *         description: Quote with signed approval token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 quoteId: { type: string, format: uuid }
 *                 approvalToken: { type: string }
 *                 expiresAt: { type: string, format: date-time }
 *                 route:
 *                   type: object
 *                   properties:
 *                     source_chain: { type: string }
 *                     dest_chain: { type: string }
 *                     net_gain_bps: { type: integer }
 *                     route_cost_bps: { type: integer }
 *                     payback_days: { type: number }
 *       422:
 *         description: No better route found or no policy configured
 */
router.post("/agent/quote", requireAuth, async (req, res, next) => {
  try {
    const parsed = QuoteRequestSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

    const { amount, asset = "USDC" } = parsed.data;
    const wallet = req.walletAddress!;

    await upsertUser(getDb(), wallet);

    const result = await createQuote(getDb(), wallet, asset as Asset, BigInt(amount));
    if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }

    res.json({ quoteId: result.quoteId, route: result.route, approvalToken: result.approvalToken, expiresAt: result.expiresAt });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/agent/execute:
 *   post:
 *     tags: [Agent]
 *     summary: Execute an approved rebalance
 *     description: Consumes a signed approval token from POST /api/agent/quote, submits the on-chain transactions, and returns the run record. Metered via x402 at $0.10 per call.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [approvalToken]
 *             properties:
 *               approvalToken: { type: string, description: "JWT returned by POST /api/agent/quote" }
 *     responses:
 *       200:
 *         description: Run record
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 run:
 *                   type: object
 *                   properties:
 *                     id: { type: string, format: uuid }
 *                     status: { type: string, enum: [completed, failed] }
 *                     tx_hashes: { type: array, items: { type: string } }
 *       400:
 *         description: Missing approvalToken
 *       403:
 *         description: Token wallet does not match session
 *       404:
 *         description: Quote not found
 *       410:
 *         description: Quote expired
 *       402:
 *         description: Payment required (x402). Response body lists accepted payment methods.
 *       501:
 *         description: Quote is a cross-chain route; execution is not yet supported
 */
router.post(
  "/agent/execute",
  createX402Middleware({
    price: X402_PRICES.execute,
    description: "Execute an approved rebalance on behalf of a wallet.",
    endpoint: "POST /api/agent/execute",
  }),
  requireAuth,
  async (req, res, next) => {
    try {
      const { approvalToken } = req.body as { approvalToken?: string };
      if (!approvalToken) { res.status(400).json({ error: "approvalToken required" }); return; }

      const result = await executeApprovedRebalance(getDb(), req.walletAddress!, approvalToken);
      if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }

      res.json({ run: result.run });
    } catch (err) { next(err); }
  },
);

/**
 * @swagger
 * /api/agent/quotes:
 *   get:
 *     tags: [Agent]
 *     summary: List quotes awaiting approval for the authenticated wallet
 *     description: Returns the most recent quotes that have not yet been executed, newest first.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Quotes awaiting a decision
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 quotes:
 *                   type: array
 *                   items: { type: object }
 */
router.get("/agent/quotes", requireAuth, async (req, res, next) => {
  try {
    const quotes = await getQuotes(getDb(), req.walletAddress!);
    res.json({ quotes: quotes.map((q) => ({ ...q, amount: String(q.amount) })) });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/agent/quotes/{id}:
 *   delete:
 *     tags: [Agent]
 *     summary: Reject a quote
 *     description: Removes a quote so it can no longer be executed. Has no effect on quotes belonging to other wallets.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Quote removed (or already gone)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 */
router.delete("/agent/quotes/:id", requireAuth, async (req, res, next) => {
  try {
    await deleteQuote(getDb(), req.walletAddress!, String(req.params["id"]));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/agent/runs:
 *   get:
 *     tags: [Runs]
 *     summary: List rebalance runs for the authenticated wallet
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: Paginated run list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 runs: { type: array, items: { type: object } }
 */
router.get("/agent/runs", requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Number(String(req.query["limit"] ?? "20")), 100);
    const offset = Number(String(req.query["offset"] ?? "0"));
    const runs = await getRuns(getDb(), req.walletAddress!, { limit, offset });
    res.json({ runs });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/agent/runs/{id}:
 *   get:
 *     tags: [Runs]
 *     summary: Get a single run by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Run record
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 run: { type: object }
 *       404:
 *         description: Run not found
 */
router.get("/agent/runs/:id", requireAuth, async (req, res, next) => {
  try {
    const { data: run } = await getDb()
      .from("runs").select("*").eq("id", String(req.params["id"])).eq("wallet_address", req.walletAddress!).maybeSingle();
    if (!run) { res.status(404).json({ error: "Run not found" }); return; }
    res.json({ run });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/agent/policy:
 *   get:
 *     tags: [Policy]
 *     summary: Get the latest policy for the authenticated wallet
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Current policy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 policy:
 *                   type: object
 *                   properties:
 *                     version: { type: integer }
 *                     min_net_gain_bps: { type: integer, example: 50 }
 *                     max_route_cost_bps: { type: integer, example: 150 }
 *                     cooldown_hours: { type: integer, example: 24 }
 *                     kill_switch: { type: boolean }
 *                     allowed_chains: { type: array, items: { type: string } }
 *                     allowed_venues: { type: array, items: { type: string } }
 *       404:
 *         description: No policy configured
 */
router.get("/agent/policy", requireAuth, async (req, res, next) => {
  try {
    const policy = await getLatestPolicy(getDb(), req.walletAddress!);
    if (!policy) { res.status(404).json({ error: "No policy configured" }); return; }
    res.json({ policy });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/agent/policy:
 *   put:
 *     tags: [Policy]
 *     summary: Save a new policy version
 *     description: Creates a new policy version (immutable append). The new version becomes the active policy immediately.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               min_net_gain_bps: { type: integer, minimum: 0, example: 50 }
 *               max_route_cost_bps: { type: integer, minimum: 0, example: 150 }
 *               cooldown_hours: { type: integer, minimum: 0, example: 24 }
 *               kill_switch: { type: boolean, example: false }
 *               allowed_chains: { type: array, items: { type: string }, example: [celo, optimism] }
 *               allowed_venues: { type: array, items: { type: string }, example: [moola, aave-v3] }
 *     responses:
 *       200:
 *         description: Saved policy with incremented version
 *       400:
 *         description: Validation error
 */
router.put("/agent/policy", requireAuth, async (req, res, next) => {
  try {
    const parsed = PolicyUpdateSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

    const db = getDb();
    const current = await getLatestPolicy(db, req.walletAddress!);
    const nextVersion = (current?.version ?? 0) + 1;

    const { data: policy, error } = await db.from("policies").insert({
      wallet_address: req.walletAddress!,
      version: nextVersion,
      ...parsed.data,
    }).select().single();

    if (error) { next(new Error(error.message)); return; }
    res.json({ policy });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/agent/chat:
 *   post:
 *     tags: [Chat]
 *     summary: Send a natural language message to Ada
 *     description: Parses the message with Groq (llama-3.3-70b), executes the detected intent (check yields, check balance, explain last run, rebalance), saves both sides to history, and returns the response.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message: { type: string, example: "What's the best yield right now?" }
 *     responses:
 *       200:
 *         description: Assistant response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response: { type: string, example: "Found 2 yield sources. Best USDC: 2.34% APR." }
 *                 command:
 *                   type: object
 *                   properties:
 *                     type: { type: string, example: check_yields }
 *                 payload: { type: object, nullable: true }
 *       400:
 *         description: Missing or invalid message
 */
router.post("/agent/chat", requireAuth, async (req, res, next) => {
  try {
    const parsed = ChatInputSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

    const { message } = parsed.data;
    const wallet = req.walletAddress!;
    const db = getDb();

    await db.from("chats").insert({ wallet_address: wallet, role: "user" as const, content: message });

    const cmd = await parseCommand(message, wallet);
    const { text: responseText, payload } = await respondToCommand(cmd, message, wallet, db);

    await db.from("chats").insert({ wallet_address: wallet, role: "assistant" as const, content: responseText });

    res.json({ response: responseText, command: cmd, payload });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/agent/chat:
 *   get:
 *     tags: [Chat]
 *     summary: Fetch chat history for the authenticated wallet
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Message history (oldest first)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messages:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string, format: uuid }
 *                       role: { type: string, enum: [user, assistant] }
 *                       content: { type: string }
 *                       created_at: { type: string, format: date-time }
 */
router.get("/agent/chat", requireAuth, async (req, res, next) => {
  try {
    const history = await getChatHistory(getDb(), req.walletAddress!);
    res.json({ messages: history });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/agent/telegram:
 *   post:
 *     tags: [Telegram]
 *     summary: Save or update Telegram bot configuration
 *     description: Encrypts the bot token with AES-256-GCM and stores it. The raw token is never persisted.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bot_token, chat_id, events]
 *             properties:
 *               bot_token: { type: string, example: "123456:ABC-DEF..." }
 *               chat_id: { type: string, example: "-1001234567890" }
 *               events:
 *                 type: array
 *                 items: { type: string, enum: [dry_run, executed, error] }
 *     responses:
 *       200:
 *         description: Config saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 */
router.post("/agent/telegram", requireAuth, async (req, res, next) => {
  try {
    const parsed = TelegramConfigInputSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

    const { bot_token, chat_id, events } = parsed.data;
    const ciphertext = encrypt(bot_token);
    const db = getDb();

    await db.from("telegram_configs").upsert({
      wallet_address: req.walletAddress!,
      bot_token_ciphertext: ciphertext,
      chat_id,
      events,
    }, { onConflict: "wallet_address" });

    logger.info({ wallet: req.walletAddress }, "Telegram config saved");
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/**
 * @swagger
 * /api/agent/telegram/webhook:
 *   post:
 *     tags: [Telegram]
 *     summary: Receive incoming Telegram webhook updates
 *     description: Called by Telegram's servers. Validates the X-Telegram-Bot-Api-Secret-Token header, parses commands (/balance, /pause, /resume), and responds via the bot.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Telegram Update object
 *     responses:
 *       200:
 *         description: Update acknowledged
 *       403:
 *         description: Invalid webhook secret
 */
router.post("/agent/telegram/webhook", handleTelegramWebhook);

export default router;
