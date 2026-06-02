"use client";

import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { SWRConfig } from "swr";
import { dynamicSettings } from "@/lib/dynamic-config";

/**
 * Root client providers:
 *   - DynamicContextProvider: wallet connection (MiniPay, injected, WalletConnect)
 *   - SWRConfig: shared data-fetching defaults with 30s revalidation
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <DynamicContextProvider settings={dynamicSettings}>
      <SWRConfig
        value={{
          refreshInterval: 30_000,
          revalidateOnFocus: true,
          shouldRetryOnError: false,
        }}
      >
        {children}
      </SWRConfig>
    </DynamicContextProvider>
  );
}
