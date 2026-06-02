"use client";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { truncateAddress } from "@/lib/utils";

/**
 * Single control that walks the user through connect then sign-in.
 * Shows the truncated address and a sign-out option once authenticated.
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
    signOut,
  } = useAuth();

  if (hasSession && walletAddress) {
    return (
      <div className="flex items-center gap-3">
        <span className="rounded-md bg-secondary px-3 py-1.5 text-sm font-medium">
          {truncateAddress(walletAddress)}
        </span>
        <Button variant="outline" size="sm" onClick={signOut}>
          Sign out
        </Button>
      </div>
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
