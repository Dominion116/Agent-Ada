import type { Metadata, Viewport } from "next";
import { Providers } from "@/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Ada — Autonomous stablecoin yield on Celo",
  description:
    "Ada watches your stablecoins, finds the strongest yield on Celo and beyond, " +
    "and rebalances under policies you set once. Reachable from a dashboard, " +
    "Telegram, and a paid API.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // MiniPay users may open Ada on small devices; lock to a sensible minimum.
  minimumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
