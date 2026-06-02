import { randomBytes } from "crypto";

interface NonceEntry {
  nonce: string;
  expiresAt: number;
}

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const store = new Map<string, NonceEntry>();

/** Issues a fresh one-time nonce for the given wallet address. */
export function issueNonce(walletAddress: string): string {
  const nonce = randomBytes(16).toString("hex");
  store.set(walletAddress.toLowerCase(), {
    nonce,
    expiresAt: Date.now() + NONCE_TTL_MS,
  });
  return nonce;
}

/** Consumes (deletes) the nonce for a wallet. Returns it if valid, null if expired or missing. */
export function consumeNonce(walletAddress: string): string | null {
  const key = walletAddress.toLowerCase();
  const entry = store.get(key);
  if (!entry) return null;
  store.delete(key);
  if (Date.now() > entry.expiresAt) return null;
  return entry.nonce;
}
