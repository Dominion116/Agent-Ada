import Link from "next/link";
import { ConnectButton } from "@/components/connect-button";
import { FeatureScroll } from "@/components/landing/feature-scroll";

/**
 * Landing page (Phase 4.2). Composed from the brand design system:
 *   - a full-bleed Ink hero with the connect surface,
 *   - the FeatureScroll (single source of truth for the theme),
 *   - a Bone footer with the required links and disclaimer.
 * Fully static; the only interactive island is ConnectButton.
 */
export default function HomePage() {
  return (
    <>
      <header
        className="relative flex h-screen w-full flex-col justify-between overflow-hidden px-[4vw] pt-[4vw] pb-[6vw]"
        style={{ backgroundColor: "var(--brand-ink)", color: "var(--brand-white)" }}
      >
        <div className="flex items-center justify-between">
          <span className="text-lg font-extrabold uppercase tracking-[0.3em]">Ada</span>
          <span className="eyebrow opacity-60">Autonomous treasury · Celo</span>
        </div>

        <div className="max-w-[18ch]">
          <h1 className="display">
            Stablecoin
            <br />
            Yield,
            <br />
            <span style={{ color: "var(--brand-ember)" }}>Handled</span>
          </h1>
        </div>

        <div className="flex flex-col gap-6">
          <p className="max-w-[48ch] text-[clamp(1rem,2.2vw,1.6rem)] leading-relaxed opacity-80">
            Ada finds the strongest yield for your stablecoins, prices the full cost of every
            move, and rebalances under policies you set once.
          </p>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <ConnectButton />
            <Link
              href="/dashboard"
              className="text-sm font-semibold uppercase tracking-wider underline underline-offset-4 opacity-80 transition-opacity hover:opacity-100"
            >
              Open dashboard
            </Link>
          </div>
        </div>
      </header>

      <FeatureScroll />

      <footer
        className="w-full px-[4vw] py-[6vw]"
        style={{ backgroundColor: "var(--brand-bone)", color: "var(--brand-ink)" }}
      >
        <div className="flex flex-wrap items-end justify-between gap-8">
          <div>
            <p className="text-2xl font-extrabold uppercase tracking-[0.3em]">Ada</p>
            <p className="mt-2 max-w-[40ch] text-sm leading-relaxed opacity-70">
              Autonomous stablecoin treasury agent on Celo. Ada surfaces yield data. It does not
              provide financial advice.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-8 gap-y-3 text-sm font-semibold uppercase tracking-wider">
            <a
              href="https://github.com"
              className="underline-offset-4 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            <a
              href="https://www.npmjs.com/package/agent-ada"
              className="underline-offset-4 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              npm CLI
            </a>
            <a
              href="https://agentscan.xyz"
              className="underline-offset-4 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              agentscan
            </a>
            <a
              href="https://8004scan.xyz"
              className="underline-offset-4 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              8004scan
            </a>
          </nav>
        </div>
        <hr className="rule mt-[4vw] opacity-30" />
        <p className="text-xs uppercase tracking-wider opacity-50">
          Built for the Celo Onchain Agents Hackathon.
        </p>
      </footer>
    </>
  );
}
