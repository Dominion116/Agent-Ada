import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConnectButton } from "@/components/connect-button";

/**
 * Placeholder landing page. The full marketing landing (hero, features,
 * how-it-works, demo video, footer) is built in Phase 4.2.
 */
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 text-center">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          Stablecoin yield,
          <br />
          on autopilot.
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Ada watches your stablecoins on Celo, finds the strongest yield, and rebalances
          under policies you set once. No dashboards required, unless you want one.
        </p>
      </div>

      <ConnectButton />

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg" variant="outline">
          <Link href="/dashboard">Open Dashboard</Link>
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Built for the Celo Onchain Agents Hackathon. Ada surfaces yield. It does not provide
        financial advice.
      </p>
    </main>
  );
}
