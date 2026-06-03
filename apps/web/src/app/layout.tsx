import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/providers";
import "./globals.css";

// Brand typeface for the whole app. Loaded once here and exposed as --font-sans
// so the design system tokens in globals.css can reference it.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Agent Ada: Autonomous stablecoin yield on Celo",
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

// Applies the saved (or system) theme before paint to avoid a flash of the
// wrong theme. Reads the same `ada-theme` key the ThemeToggle writes.
const themeScript = `
try {
  var stored = localStorage.getItem('ada-theme');
  var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (dark) document.documentElement.classList.add('dark');
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={jakarta.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
