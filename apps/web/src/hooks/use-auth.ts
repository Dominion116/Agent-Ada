"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useDynamicContext,
  useIsLoggedIn,
} from "@dynamic-labs/sdk-react-core";
import { fetchNonce, verifySignature, setToken, clearToken, getToken } from "@/lib/api";

/**
 * Bridges a connected Dynamic wallet to an Ada backend session.
 *
 * Flow:
 *   1. User connects a wallet via Dynamic.
 *   2. We request a nonce from the backend.
 *   3. We build a SIWE message and ask the wallet to sign it.
 *   4. We exchange the signature for a backend JWT.
 *
 * Exposes the session state and a signIn() trigger. The dashboard layout
 * calls signIn() automatically once a wallet is connected.
 */
export function useAuth() {
  const { primaryWallet, handleLogOut } = useDynamicContext();
  const isWalletConnected = useIsLoggedIn();
  const [hasSession, setHasSession] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHasSession(Boolean(getToken()));
  }, []);

  const signIn = useCallback(async () => {
    if (!primaryWallet?.address) return;
    setSigningIn(true);
    setError(null);

    try {
      const wallet = primaryWallet.address;
      const nonce = await fetchNonce(wallet);

      const message = buildSiweMessage(wallet, nonce);
      const signature = await primaryWallet.signMessage(message);
      if (!signature) throw new Error("Signature was rejected");

      const { token } = await verifySignature(message, signature);
      setToken(token);
      setHasSession(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setHasSession(false);
    } finally {
      setSigningIn(false);
    }
  }, [primaryWallet]);

  const signOut = useCallback(async () => {
    clearToken();
    setHasSession(false);
    await handleLogOut();
  }, [handleLogOut]);

  return {
    walletAddress: primaryWallet?.address ?? null,
    isWalletConnected,
    hasSession,
    signingIn,
    error,
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
