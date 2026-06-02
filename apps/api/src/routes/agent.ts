import { Router } from "express";
import { randomUUID } from "crypto";
import { requireAuth } from "../middleware/auth.js";
import { getDb, getLatestPolicy, getRuns, getChatHistory, getTelegramConfig, upsertUser } from "../lib/db.js";
import { encrypt } from "../lib/crypto.js";
import { signApprovalToken, verifyApprovalToken } from "../lib/jwt.js";
import { getYields } from "../agent/yield-discovery.js";
import { buildQuote } from "../agent/loop.js";
import { executeRebalance, type RunRepository } from "../agent/execution-engine.js";
import { parseCommand, composeExplanation } from "../agent/nl-parser.js";
import { sendTelegramNotification } from "../telegram/notify.js";
import { handleTelegramWebhook } from "../telegram/handler.js";
import { buildAgentProfile } from "@ada/contracts";
import { PolicyUpdateSchema, TelegramConfigInputSchema, ChatInputSchema, QuoteRequestSchema } from "@ada/shared";
import { logger } from "../lib/logger.js";
import type { Chain, Venue, Asset, Json, Run } from "@ada/shared";

const router = Router();

function dbRepo(): RunRepository {
  const db = getDb();
  return {
    async create(run) {
      const { error } = await db.from("runs").insert({
        id: run.id,
        wallet_address: run.wallet_address,
        quote_id: run.quote_id,
        mode: run.mode,
        status: run.status,
        tx_hashes: run.tx_hashes,
        policy_version: run.policy_version,
        outcome: run.outcome as unknown as Json | null,
        started_at: run.started_at,
        completed_at: run.completed_at,
      });
      if (error) throw new Error(error.message);
    },
    async update(id, patch) {
      const { error } = await db.from("runs").update({
        ...(patch.status !== undefined && { status: patch.status }),
        ...(patch.tx_hashes !== undefined && { tx_hashes: patch.tx_hashes as unknown as Json }),
        ...(patch.outcome !== undefined && { outcome: patch.outcome as unknown as Json }),
        ...(patch.completed_at !== undefined && { completed_at: patch.completed_at }),
      }).eq("id", id);
      if (error) throw new Error(error.message);
    },
  };
}

// ── GET /api/agent/profile ────────────────────────────────────
router.get("/agent/profile", (_req, res) => {
  res.json(buildAgentProfile());
});

// ── GET /api/agent/yields (x402 metered) ─────────────────────
router.get("/agent/yields", async (_req, res, next) => {
  try {
    const yields = await getYields();
    res.json({ yields, cachedAt: new Date().toISOString() });
  } catch (err) { next(err); }
});

// ── GET /api/agent/balance ────────────────────────────────────
router.get("/agent/balance", requireAuth, async (req, res, next) => {
  try {
    const { getAllStablecoinBalances } = await import("../onchain/celo-client.js");
    const balances = await getAllStablecoinBalances(req.walletAddress as `0x${string}`);
    res.json({ balances });
  } catch (err) { next(err); }
});

// ── POST /api/agent/quote ─────────────────────────────────────
router.post("/agent/quote", requireAuth, async (req, res, next) => {
  try {
    const parsed = QuoteRequestSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

    const { amount, asset = "USDC" } = parsed.data;
    const wallet = req.walletAddress!;

    await upsertUser(getDb(), wallet);

    const route = await buildQuote(wallet, asset as Asset, BigInt(amount));
    if (!route) { res.status(422).json({ error: "No better route found or no policy configured" }); return; }

    const db = getDb();
    const policy = await getLatestPolicy(db, wallet);
    if (!policy) { res.status(422).json({ error: "No policy configured" }); return; }

    const quoteId = randomUUID();
    const approvalToken = await signApprovalToken(quoteId, wallet);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await db.from("quotes").insert({
      id: quoteId,
      wallet_address: wallet,
      source_chain: route.source_chain,
      source_venue: route.source_venue,
      dest_chain: route.dest_chain,
      dest_venue: route.dest_venue,
      asset: route.asset,
      amount: Number(route.amount_in),
      route_cost_bps: route.route_cost_bps,
      net_gain_bps: route.net_gain_bps,
      payback_days: route.payback_days,
      policy_version: policy.version,
      approval_token: approvalToken,
      expires_at: expiresAt,
    });

    res.json({ quoteId, route, approvalToken, expiresAt });
  } catch (err) { next(err); }
});

// ── POST /api/agent/execute ───────────────────────────────────
router.post("/agent/execute", requireAuth, async (req, res, next) => {
  try {
    const { approvalToken } = req.body as { approvalToken?: string };
    if (!approvalToken) { res.status(400).json({ error: "approvalToken required" }); return; }

    const { quoteId, walletAddress } = await verifyApprovalToken(approvalToken);
    if (walletAddress !== req.walletAddress) { res.status(403).json({ error: "Token does not match session wallet" }); return; }

    const db = getDb();
    const { data: quote } = await db.from("quotes").select("*").eq("id", quoteId).maybeSingle();
    if (!quote) { res.status(404).json({ error: "Quote not found or expired" }); return; }
    if (new Date(quote.expires_at) < new Date()) { res.status(410).json({ error: "Quote expired" }); return; }

    const policy = await getLatestPolicy(db, walletAddress);
    if (!policy) { res.status(422).json({ error: "No policy configured" }); return; }

    const [lastRun] = await getRuns(db, walletAddress, { limit: 1 });

    const route = {
      source_chain: quote.source_chain as Chain,
      source_venue: quote.source_venue as Venue,
      dest_chain: quote.dest_chain as Chain,
      dest_venue: quote.dest_venue as Venue,
      asset: quote.asset as Asset,
      amount_in: String(quote.amount),
      amount_out: String(quote.amount * (1 - quote.route_cost_bps / 10000)),
      route_cost_bps: quote.route_cost_bps,
      net_gain_bps: quote.net_gain_bps,
      payback_days: quote.payback_days,
      estimated_time_seconds: 300,
      lifi_route: null,
    };

    const run = await executeRebalance({
      walletAddress: walletAddress as `0x${string}`,
      route,
      policy: { ...policy, allowed_chains: policy.allowed_chains as Chain[], allowed_venues: policy.allowed_venues as Venue[] },
      lastRun: lastRun ? { completed_at: lastRun.completed_at } : null,
      quoteId,
      mode: "live",
      repo: dbRepo(),
      generateId: randomUUID,
    });

    const event = run.status === "completed" ? "executed" : "error";
    sendTelegramNotification(walletAddress, event, run).catch(() => {});

    res.json({ run });
  } catch (err) { next(err); }
});

// ── GET /api/agent/runs ───────────────────────────────────────
router.get("/agent/runs", requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Number(String(req.query["limit"] ?? "20")), 100);
    const offset = Number(String(req.query["offset"] ?? "0"));
    const runs = await getRuns(getDb(), req.walletAddress!, { limit, offset });
    res.json({ runs });
  } catch (err) { next(err); }
});

// ── GET /api/agent/runs/:id ───────────────────────────────────
router.get("/agent/runs/:id", requireAuth, async (req, res, next) => {
  try {
    const { data: run } = await getDb()
      .from("runs").select("*").eq("id", String(req.params["id"])).eq("wallet_address", req.walletAddress!).maybeSingle();
    if (!run) { res.status(404).json({ error: "Run not found" }); return; }
    res.json({ run });
  } catch (err) { next(err); }
});

// ── GET /api/agent/policy ─────────────────────────────────────
router.get("/agent/policy", requireAuth, async (req, res, next) => {
  try {
    const policy = await getLatestPolicy(getDb(), req.walletAddress!);
    if (!policy) { res.status(404).json({ error: "No policy configured" }); return; }
    res.json({ policy });
  } catch (err) { next(err); }
});

// ── PUT /api/agent/policy ─────────────────────────────────────
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

// ── POST /api/agent/chat ──────────────────────────────────────
router.post("/agent/chat", requireAuth, async (req, res, next) => {
  try {
    const parsed = ChatInputSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

    const { message } = parsed.data;
    const wallet = req.walletAddress!;
    const db = getDb();

    await db.from("chats").insert({ wallet_address: wallet, role: "user" as const, content: message });

    const cmd = await parseCommand(message, wallet);

    let responseText = "";
    let payload: Record<string, unknown> | null = null;

    if (cmd.type === "check_yields") {
      const yields = await getYields().catch(() => []);
      responseText = yields.length
        ? `Found ${yields.length} yield sources. Best USDC: ${Math.max(...yields.map((y) => y.supply_rate_bps)) / 100}% APR.`
        : "Unable to fetch yields right now.";
      payload = { yields };
    } else if (cmd.type === "check_balance") {
      responseText = "Check the dashboard for your current balance across all supported chains.";
    } else if (cmd.type === "explain_last_run") {
      const [lastRun] = await getRuns(db, wallet, { limit: 1 });
      if (lastRun) {
        const runTyped = lastRun as unknown as Run;
        responseText = await composeExplanation(runTyped).catch(() => `Last run status: ${lastRun.status}`);
      } else {
        responseText = "No runs found yet.";
      }
    } else if (cmd.type === "rebalance") {
      responseText = `Understood. Use the Approvals page or send a quote request to start a rebalance of ${cmd.amount} USDC.`;
    } else {
      responseText = "I didn't understand that. Try: check yields, check balance, or explain last run.";
    }

    await db.from("chats").insert({ wallet_address: wallet, role: "assistant" as const, content: responseText });

    res.json({ response: responseText, command: cmd, payload });
  } catch (err) { next(err); }
});

// ── GET /api/agent/chat ───────────────────────────────────────
router.get("/agent/chat", requireAuth, async (req, res, next) => {
  try {
    const history = await getChatHistory(getDb(), req.walletAddress!);
    res.json({ messages: history });
  } catch (err) { next(err); }
});

// ── POST /api/agent/telegram ──────────────────────────────────
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

// ── POST /api/agent/telegram/webhook ─────────────────────────
router.post("/agent/telegram/webhook", handleTelegramWebhook);

export default router;
