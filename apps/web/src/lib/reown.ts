/**
 * Reown AppKit configuration — WalletConnect fallback for desktop/browser
 * users with no injected provider.
 *
 * MiniPay and other injected wallets keep using the lean EIP-1193 path in
 * `lib/wallet.ts`. This module only powers the AppKit modal that opens when
 * `connect()` finds no `window.ethereum`, scoped to Celo.
 */

import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { celo } from "@reown/appkit/networks";
import { QueryClient } from "@tanstack/react-query";

export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";

if (!projectId && typeof window !== "undefined") {
  console.warn(
    "NEXT_PUBLIC_REOWN_PROJECT_ID is not set; the WalletConnect fallback is disabled.",
  );
}

export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: [celo],
  ssr: true,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

export const queryClient = new QueryClient();

createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks: [celo],
  defaultNetwork: celo,
  metadata: {
    name: "Agent Ada",
    description:
      "Autonomous stablecoin treasury agent on Celo. Monitors yield, prices cross-chain moves, and rebalances under your policy.",
    url: "https://agent-ada-web.vercel.app",
    icons: ["https://agent-ada-web.vercel.app/ada-icon.png"],
  },
  features: {
    analytics: false,
    email: false,
    socials: [],
  },
});
