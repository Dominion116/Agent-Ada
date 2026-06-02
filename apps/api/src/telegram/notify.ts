import { getDb, getTelegramConfig } from "../lib/db.js";
import { decrypt } from "../lib/crypto.js";
import { logger } from "../lib/logger.js";
import type { Run, TxRecord } from "@ada/shared";

type TelegramEvent = "dry_run" | "executed" | "error";

async function sendMessage(botToken: string, chatId: string, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`);
  }
}

function formatDryRun(run: Run): string {
  const outcome = (run.outcome ?? {}) as Record<string, unknown>;
  const route = outcome["route"] as Record<string, unknown> | undefined;
  if (!route) return "Ada found a potential rebalance opportunity. Check the dashboard to review and approve.";

  const source = `${route["source_venue"]} on ${route["source_chain"]}`;
  const dest = `${route["dest_venue"]} on ${route["dest_chain"]}`;
  const gainBps = Number(route["net_gain_bps"] ?? 0);
  const costBps = Number(route["route_cost_bps"] ?? 0);
  const paybackDays = Number(route["payback_days"] ?? 0).toFixed(1);

  return (
    `<b>Ada: Rebalance Opportunity</b>\n\n` +
    `Move your ${String(route["asset"])} from <b>${source}</b> to <b>${dest}</b>.\n\n` +
    `Net yield gain: <b>${(gainBps / 100).toFixed(2)}%</b> per year\n` +
    `Bridge cost: <b>${(costBps / 100).toFixed(3)}%</b> one-time\n` +
    `Break-even in <b>${paybackDays} days</b>\n\n` +
    `Reply <b>approve</b> to execute, or <b>stop</b> to pause Ada.`
  );
}

function formatExecuted(run: Run): string {
  const txs = (run.tx_hashes as TxRecord[]).filter((t) => t.status === "confirmed");
  const outcome = (run.outcome ?? {}) as Record<string, unknown>;
  const route = outcome["route"] as Record<string, unknown> | undefined;

  if (run.status === "failed") {
    const err = String(outcome["error"] ?? "Unknown error");
    return `<b>Ada: Rebalance Failed</b>\n\n${err}\n\nNo funds were moved.`;
  }

  const dest = route
    ? `${route["dest_venue"]} on ${route["dest_chain"]}`
    : "the destination";

  return (
    `<b>Ada: Rebalance Complete</b>\n\n` +
    `Your funds have been moved to <b>${dest}</b>.\n` +
    `${txs.length} transaction(s) confirmed.\n\n` +
    `Check the dashboard for full details.`
  );
}

function formatError(run: Run): string {
  const outcome = (run.outcome ?? {}) as Record<string, unknown>;
  const err = String(outcome["error"] ?? "An unexpected error occurred");
  return `<b>Ada: Error</b>\n\nRun <code>${run.id.slice(0, 8)}</code> failed.\n\n${err}`;
}

/**
 * Sends a Telegram notification to the wallet's configured bot.
 * Silently skips if no Telegram config exists for the wallet.
 */
export async function sendTelegramNotification(
  walletAddress: string,
  event: TelegramEvent,
  run: Run,
): Promise<void> {
  const db = getDb();
  const config = await getTelegramConfig(db, walletAddress);
  if (!config) return;

  if (!config.events.includes(event)) return;

  let text: string;
  try {
    text =
      event === "dry_run"
        ? formatDryRun(run)
        : event === "error"
          ? formatError(run)
          : formatExecuted(run);
  } catch {
    text = `Ada: run ${run.id.slice(0, 8)} status: ${run.status}`;
  }

  let botToken: string;
  try {
    botToken = decrypt(config.bot_token_ciphertext);
  } catch (err) {
    logger.error({ walletAddress, err }, "Failed to decrypt Telegram bot token");
    return;
  }

  try {
    await sendMessage(botToken, config.chat_id, text);
    logger.info({ walletAddress, event }, "Telegram notification sent");
  } catch (err) {
    logger.warn({ walletAddress, event, err }, "Telegram notification failed");
  }
}
