"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAccount, useDisconnect, useSignMessage } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import {
  connectWallet,
  getConnectedAccount,
  getProvider,
  hasInjectedWallet,
  isMiniPay,
  signMessage as signWithProvider,
} from "@/lib/wallet";

interface WalletState {
  address: string | null;
  isConnected: boolean;
  isMiniPay: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  signMessage: (message: string) => Promise<string>;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [injectedAddress, setInjectedAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [miniPay, setMiniPay] = useState(false);

  // WalletConnect fallback for browsers with no injected provider.
  const { address: reownAddress, status: reownStatus } = useAccount();
  const { disconnect: disconnectReown } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { open } = useAppKit();

  // On mount, pick up an already-authorised account (MiniPay auto-connects).
  useEffect(() => {
    setMiniPay(isMiniPay());
    getConnectedAccount().then((acc) => {
      if (acc) setInjectedAddress(acc);
    });

    const provider = getProvider();
    if (!provider?.on) return;

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      setInjectedAddress(accounts?.[0] ?? null);
    };
    provider.on("accountsChanged", handleAccountsChanged);
    return () => provider.removeListener?.("accountsChanged", handleAccountsChanged);
  }, []);

  const address = injectedAddress ?? reownAddress ?? null;

  const connect = useCallback(async () => {
    setError(null);

    if (hasInjectedWallet()) {
      setConnecting(true);
      try {
        const acc = await connectWallet();
        setInjectedAddress(acc);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to connect wallet");
      } finally {
        setConnecting(false);
      }
      return;
    }

    // No injected provider (e.g. desktop browser): fall back to Reown's
    // WalletConnect modal for any mobile or browser wallet.
    try {
      await open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open wallet connector");
    }
  }, [open]);

  const disconnect = useCallback(() => {
    setInjectedAddress(null);
    if (reownAddress) disconnectReown();
  }, [reownAddress, disconnectReown]);

  const signMessage = useCallback(
    async (message: string) => {
      if (injectedAddress) return signWithProvider(injectedAddress, message);
      if (reownAddress) return signMessageAsync({ message });
      throw new Error("Wallet not connected");
    },
    [injectedAddress, reownAddress, signMessageAsync],
  );

  return (
    <WalletContext.Provider
      value={{
        address,
        isConnected: address !== null,
        isMiniPay: miniPay,
        connecting: connecting || reownStatus === "connecting" || reownStatus === "reconnecting",
        error,
        connect,
        disconnect,
        signMessage,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}
