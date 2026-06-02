"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  connectWallet,
  getConnectedAccount,
  getProvider,
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
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [miniPay, setMiniPay] = useState(false);

  // On mount, pick up an already-authorised account (MiniPay auto-connects).
  useEffect(() => {
    setMiniPay(isMiniPay());
    getConnectedAccount().then((acc) => {
      if (acc) setAddress(acc);
    });

    const provider = getProvider();
    if (!provider?.on) return;

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      setAddress(accounts?.[0] ?? null);
    };
    provider.on("accountsChanged", handleAccountsChanged);
    return () => provider.removeListener?.("accountsChanged", handleAccountsChanged);
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const acc = await connectWallet();
      setAddress(acc);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
  }, []);

  const signMessage = useCallback(
    async (message: string) => {
      if (!address) throw new Error("Wallet not connected");
      return signWithProvider(address, message);
    },
    [address],
  );

  return (
    <WalletContext.Provider
      value={{
        address,
        isConnected: address !== null,
        isMiniPay: miniPay,
        connecting,
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
