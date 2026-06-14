"use client";

import { SWRConfig } from "swr";
import { WagmiProvider } from "wagmi";
import { QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig, queryClient } from "@/lib/reown";
import { WalletProvider } from "@/hooks/use-wallet";

/**
 * Root client providers:
 *   - WagmiProvider / QueryClientProvider: required by Reown AppKit, used
 *     only as the WalletConnect fallback for non-injected wallets
 *   - WalletProvider: lean EIP-1193 wallet connection (MiniPay + injected),
 *     falling back to the AppKit modal above
 *   - SWRConfig: shared data-fetching defaults with 30s revalidation
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
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
      </QueryClientProvider>
    </WagmiProvider>
  );
}
