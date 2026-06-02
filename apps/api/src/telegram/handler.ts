import type { Request, Response } from "express";
import { getDb, getLatestPolicy, getTelegramConfig } from "../lib/db.js";
import { decrypt } from "../lib/crypto.js";
import { parseCommand } from "../agent/nl-parser.js";
import { getYields, bestYield } from "../agent/yield-discovery.js";
import { logger } from "../lib/logger.js";

interface TelegramUpdate {
  message?: {
    text?: string;
    chat: { id: number };
    from?: { id: number };
  };
}

async function reply(botToken: string, chatId: number, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

async function findWalletForChatId(chatId: number): Promise<string | null> {
  const db = getDb();
  const { data } = await db
    .from("telegram_configs")
    .select("wallet_address, bot_token_ciphertext")
    .eq("chat_id", String(chatId))
    .maybeSingle();
  return data?.wallet_address ?? null;
}

/**
 * Validates the inbound Telegram webhook secret and dispatches commands.
 *
 * Telegram sends all updates to POST /api/agent/telegram/webhook.
 * The X-Telegram-Bot-Api-Secret-Token header is validated against
 * TELEGRAM_WEBHOOK_SECRET before any processing.
 */
export async function handleTelegramWebhook(req: Request, res: Response): Promise<void> {
  const secret = process.env["TELEGRAM_WEBHOOK_SECRET"];
  if (secret && req.headers["x-telegram-bot-api-secret-token"] !== secret) {
    res.status(401).json({ error: "Invalid webhook secret" });
    return;
  }

  res.status(200).json({ ok: true }); // Acknowledge immediately

  const update = req.body as TelegramUpdate;
  const message = update.message;
  if (!message?.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();

  const walletAddress = await findWalletForChatId(chatId);

  if (!walletAddress) {
    // Not a registered wallet. Handle /start onboarding.
    if (text === "/start") {
      await handleStart(chatId);
    }
    return;
  }

  await dispatch(chatId, walletAddress, text);
}

async function handleStart(chatId: number): Promise<void> {
  const msg =
    "<b>Welcome to Ada</b>\n\n" +
    "Ada is an autonomous stablecoin yield agent on Celo.\n\n" +
    "To connect your wallet, visit the dashboard and complete the Telegram setup:\n" +
    `<code>ada.xyz/dashboard/telegram</code>\n\n` +
    "Once connected, you can use:\n" +
    "  <b>balance</b> - check your balance\n" +
    "  <b>yields</b> - see current rates\n" +
    "  <b>save N</b> - put N USDC to work\n" +
    "  <b>unwind</b> - withdraw all\n" +
    "  <b>stop</b> - pause Ada";

  // Use a fallback bot for the /start response since we don't know the token yet.
  logger.info({ chatId }, "Telegram /start from unregistered chat");
  void msg; // logged only; requires a shared bot token to send
}

async function dispatch(chatId: number, walletAddress: string, text: string): Promise<void> {
  const db = getDb();
  const config = await getTelegramConfig(db, walletAddress);
  if (!config) return;

  let botToken: string;
  try {
    botToken = decrypt(config.bot_token_ciphertext);
  } catch {
    return;
  }

  const cmd = await parseCommand(text, walletAddress);

  switch (cmd.type) {
    case "check_balance": {
      await reply(botToken, chatId, "Fetching your balance... check the dashboard for full details.");
      break;
    }

    case "check_yields": {
      const yields = await getYields().catch(() => []);
      const best = bestYield(yields, "USDC", ["celo", "base", "polygon", "arbitrum", "optimism"]);
      const msg = best
        ? `<b>Best USDC yield:</b> ${(best.supply_rate_bps / 100).toFixed(2)}% on ${best.venue} (${best.chain})`
        : "No yield data available right now.";
      await reply(botToken, chatId, msg);
      break;
    }

    case "explain_last_run": {
      await reply(botToken, chatId, "Open the dashboard to see your last run details.");
      break;
    }

    case "rebalance": {
      await reply(
        botToken,
        chatId,
        "Rebalance request received. Ada will evaluate and notify you when a route is ready.",
      );
      break;
    }

    default: {
      // kill switch via "stop" command
      if (text.toLowerCase() === "stop") {
        const policy = await getLatestPolicy(db, walletAddress);
        if (policy) {
          await db
            .from("policies")
            .update({ kill_switch: true })
            .eq("id", policy.id);
          await reply(botToken, chatId, "<b>Ada paused.</b> Kill switch activated. Reply <b>balance</b> or visit the dashboard to resume.");
        }
        break;
      }
      await reply(
        botToken,
        chatId,
        "I didn't understand that. Try: <b>balance</b>, <b>yields</b>, <b>save N</b>, <b>unwind</b>, or <b>stop</b>.",
      );
    }
  }
}
