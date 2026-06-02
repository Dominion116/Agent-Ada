import type { Request, Response, NextFunction } from "express";
import { verifyMessage } from "viem";
import { signWalletJwt, verifyWalletJwt } from "../lib/jwt.js";
import { issueNonce, consumeNonce } from "../lib/nonce-store.js";
import { logger } from "../lib/logger.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      walletAddress?: string;
    }
  }
}

// ── Nonce endpoint handlers (mounted in auth routes) ──────────

export function getNonce(req: Request, res: Response): void {
  const wallet = (req.query["wallet"] as string | undefined)?.toLowerCase();
  if (!wallet || !/^0x[0-9a-f]{40}$/i.test(wallet)) {
    res.status(400).json({ error: "wallet query param must be a valid hex address" });
    return;
  }
  const nonce = issueNonce(wallet);
  res.json({ nonce });
}

export async function verifySiwe(req: Request, res: Response): Promise<void> {
  const { message, signature } = req.body as { message?: string; signature?: string };

  if (!message || !signature) {
    res.status(400).json({ error: "message and signature are required" });
    return;
  }

  // Parse the SIWE message to extract the wallet address and nonce.
  // SIWE message format: https://eips.ethereum.org/EIPS/eip-4361
  const addressMatch = message.match(/^(0x[0-9a-fA-F]{40})/m);
  const nonceMatch = message.match(/^Nonce: ([a-f0-9]+)$/m);

  if (!addressMatch?.[1] || !nonceMatch?.[1]) {
    res.status(400).json({ error: "Invalid SIWE message format" });
    return;
  }

  const walletAddress = addressMatch[1].toLowerCase() as `0x${string}`;
  const providedNonce = nonceMatch[1];

  const storedNonce = consumeNonce(walletAddress);
  if (!storedNonce || storedNonce !== providedNonce) {
    res.status(401).json({ error: "Invalid or expired nonce" });
    return;
  }

  try {
    const valid = await verifyMessage({
      address: walletAddress,
      message,
      signature: signature as `0x${string}`,
    });

    if (!valid) {
      res.status(401).json({ error: "Signature verification failed" });
      return;
    }
  } catch {
    res.status(401).json({ error: "Signature verification failed" });
    return;
  }

  const token = await signWalletJwt(walletAddress);
  res.json({ token, walletAddress });
}

// ── requireAuth middleware ────────────────────────────────────

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers["authorization"];
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authorization header required" });
    return;
  }

  try {
    const token = header.slice(7);
    req.walletAddress = await verifyWalletJwt(token);
    next();
  } catch {
    logger.warn({ path: req.path }, "Invalid JWT");
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ── Cron auth middleware ──────────────────────────────────────

export function requireCronSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env["CRON_SECRET"];
  if (!secret) {
    res.status(500).json({ error: "CRON_SECRET not configured" });
    return;
  }
  if (req.headers["x-cron-secret"] !== secret) {
    res.status(401).json({ error: "Invalid cron secret" });
    return;
  }
  next();
}
