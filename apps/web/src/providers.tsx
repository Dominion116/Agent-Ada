"use client";

import { SWRConfig } from "swr";
import { WalletProvider } from "@/hooks/use-wallet";

/**
 * Root client providers:
 *   - WalletProvider: lean EIP-1193 wallet connection (MiniPay + injected)
 *   - SWRConfig: shared data-fetching defaults with 30s revalidation
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <SWRConfig
        value={{
          refreshInterval: 30_000,
          revalidateOnFocus: true,
          shouldRetryOnError: false,
        }}
      >
        {children}
      </SWRConfig>
    </WalletProvider>
  );
}
