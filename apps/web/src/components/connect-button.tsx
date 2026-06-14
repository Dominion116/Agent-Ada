"use client";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

/**
 * Single control that walks the user through connect then sign-in.
 * Once authenticated, the button stays as "Connect Wallet" but disabled —
 * session management lives in the dashboard, not the landing page.
 */
export function ConnectButton() {
  const {
    walletAddress,
    isWalletConnected,
    hasSession,
    connecting,
    signingIn,
    error,
    connect,
    signIn,
  } = useAuth();

  if (hasSession && walletAddress) {
    return (
      <Button size="lg" disabled>
        Connect Wallet
      </Button>
    );
  }

  if (isWalletConnected && walletAddress) {
    return (
      <div className="flex flex-col items-center gap-2">
        <Button size="lg" onClick={signIn} disabled={signingIn}>
          {signingIn ? "Check your wallet…" : "Sign in to Ada"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button size="lg" onClick={connect} disabled={connecting}>
        {connecting ? "Connecting…" : "Connect Wallet"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
