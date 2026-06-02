"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/hooks/use-wallet";
import { fetchNonce, verifySignature, setToken, clearToken, getToken } from "@/lib/api";

/**
 * Bridges a connected wallet to an Ada backend session via SIWE.
 *
 * Flow:
 *   1. User connects a wallet (MiniPay auto-connects).
 *   2. We request a nonce from the backend.
 *   3. We build a SIWE message and ask the wallet to sign it.
 *   4. We exchange the signature for a backend JWT.
 */
export function useAuth() {
  const { address, isConnected, connect, disconnect, signMessage, connecting } = useWallet();
  const [hasSession, setHasSession] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHasSession(Boolean(getToken()));
  }, []);

  const signIn = useCallback(async () => {
    if (!address) return;
    setSigningIn(true);
    setError(null);

    try {
      const nonce = await fetchNonce(address);
      const message = buildSiweMessage(address, nonce);
      const signature = await signMessage(message);

      const { token } = await verifySignature(message, signature);
      setToken(token);
      setHasSession(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setHasSession(false);
    } finally {
      setSigningIn(false);
    }
  }, [address, signMessage]);

  const signOut = useCallback(() => {
    clearToken();
    setHasSession(false);
    disconnect();
  }, [disconnect]);

  return {
    walletAddress: address,
    isWalletConnected: isConnected,
    hasSession,
    connecting,
    signingIn,
    error,
    connect,
    signIn,
    signOut,
  };
}

// ── SIWE message builder ──────────────────────────────────────
// Matches the parser in apps/api/src/middleware/auth.ts:
//   line 1: the 0x address
//   a line "Nonce: <hex>"

function buildSiweMessage(address: string, nonce: string): string {
  const domain = typeof window !== "undefined" ? window.location.host : "ada.xyz";
  const uri = typeof window !== "undefined" ? window.location.origin : "https://ada.xyz";
  const issuedAt = new Date().toISOString();

  return [
    `${address}`,
    ``,
    `${domain} wants you to sign in with your Ethereum account.`,
    ``,
    `Sign in to Agent Ada.`,
    ``,
    `URI: ${uri}`,
    `Version: 1`,
    `Chain ID: 42220`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}
