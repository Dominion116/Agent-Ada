import type { Request, Response, NextFunction } from "express";
import { verifyWalletJwt } from "../lib/jwt.js";
import { createX402Middleware } from "./x402.js";

/**
 * Wraps an x402 gate so a signed-in wallet (a Bearer JWT from the SIWE login
 * flow) passes through for free. Callers without a valid session, including
 * other agents and x402 clients, still pay the metered price.
 */
export function freeForOwnSession(x402: ReturnType<typeof createX402Middleware>) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers["authorization"];
    if (header?.startsWith("Bearer ")) {
      try {
        req.walletAddress = await verifyWalletJwt(header.slice(7));
        next();
        return;
      } catch {
        // Not a valid session token, fall through to the x402 gate.
      }
    }
    x402(req, res, next);
  };
}
