import FlowArt, { FlowSection } from "@/components/ui/story-scroll";

/**
 * Agent Ada feature scroll. This is the single source of truth for the app's
 * visual language: full-bleed color panels, oversized uppercase display type,
 * hairline rules, and uppercase tracked eyebrow labels. Content maps onto the
 * Phase 4.2 landing brief (value prop, features, how-it-works, proof, CTA).
 */

type Item = { label: string; body: string };

function Eyebrow({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <p className="eyebrow">
      <span style={{ color: "var(--brand-ember)" }}>{index}</span>
      <span className="px-2 opacity-40">·</span>
      {children}
    </p>
  );
}

function ItemGrid({ items }: { items: Item[] }) {
  return (
    <div className="flex flex-wrap gap-[3vw]">
      {items.map((item) => (
        <div key={item.label} className="min-w-[180px] flex-1">
          <p className="mb-2 text-sm font-bold uppercase tracking-wider">{item.label}</p>
          <p className="text-[clamp(0.85rem,1.3vw,1.05rem)] leading-relaxed opacity-75">
            {item.body}
          </p>
        </div>
      ))}
    </div>
  );
}

export function FeatureScroll() {
  return (
    <FlowArt aria-label="What Agent Ada does">
      {/* 01: Value proposition (Bone canvas) */}
      <FlowSection
        aria-label="Who Ada is"
        style={{ backgroundColor: "var(--brand-bone)", color: "var(--brand-ink)" }}
      >
        <Eyebrow index="01">Who Ada is</Eyebrow>
        <hr className="rule" />
        <div>
          <h1 className="display">
            Yield
            <br />
            On
            <br />
            Autopilot
          </h1>
        </div>
        <hr className="rule" />
        <p className="mt-auto max-w-[50ch] text-[clamp(1rem,2.5vw,2rem)] font-normal leading-relaxed">
          Ada watches your stablecoins on Celo, finds the strongest yield across supported
          chains, and rebalances under policies you set once. No dashboards required, unless
          you want one.
        </p>
      </FlowSection>

      {/* 02: Features (Ink canvas) */}
      <FlowSection
        aria-label="What Ada does"
        style={{ backgroundColor: "var(--brand-ink)", color: "var(--brand-white)" }}
      >
        <Eyebrow index="02">What Ada does</Eyebrow>
        <hr className="rule" />
        <div>
          <h2 className="display">
            Set
            <br />
            It
            <br />
            Once
          </h2>
        </div>
        <hr className="rule" />
        <p className="max-w-[50ch] text-[clamp(1rem,2.5vw,2rem)] font-normal leading-relaxed">
          A handful of systems working together so your treasury never sits idle.
        </p>
        <hr className="rule" />
        <ItemGrid
          items={[
            {
              label: "Yield Discovery",
              body: "Live supply rates from Moola on Celo and Aave V3 across Base, Polygon, Arbitrum, and Optimism.",
            },
            {
              label: "Policy Engine",
              body: "Minimum net gain, maximum route cost, cooldowns, allowed chains and venues. Ada only acts inside your rules.",
            },
            {
              label: "Cross-chain Routing",
              body: "LI.FI prices the full cost of moving funds, bridge fees and slippage included, before anything runs.",
            },
          ]}
        />
        <hr className="rule" />
        <ItemGrid
          items={[
            {
              label: "Telegram Companion",
              body: "Approve, pause, or check balances from chat. One tap to act, no dashboard required.",
            },
            {
              label: "Pay-per-Call API",
              body: "Other agents query Ada's yields and trigger execution over x402 micropayments.",
            },
            {
              label: "Dry Run by Default",
              body: "Every scan previews the move first. Funds only move after you approve it.",
            },
          ]}
        />
      </FlowSection>

      {/* 03: How it works (Signal Blue canvas) */}
      <FlowSection
        aria-label="How it works"
        style={{ backgroundColor: "var(--brand-blue)", color: "var(--brand-white)" }}
      >
        <Eyebrow index="03">How it works</Eyebrow>
        <hr className="rule" />
        <div>
          <h2 className="display">
            Connect
            <br />
            Set
            <br />
            Earn
          </h2>
        </div>
        <hr className="rule" />
        <p className="max-w-[50ch] text-[clamp(1rem,2.5vw,2rem)] font-normal leading-relaxed">
          Three steps. Your treasury starts working the moment you connect.
        </p>
        <hr className="rule" />
        <ItemGrid
          items={[
            {
              label: "01 Connect",
              body: "Link a Celo wallet or open Ada inside MiniPay. Sign in once with your wallet.",
            },
            {
              label: "02 Set Policy",
              body: "Pick your guardrails: how much gain is worth a move, what it may cost, where it may go.",
            },
            {
              label: "03 Earn",
              body: "Ada scans on a schedule, previews each rebalance, and acts only with your approval.",
            },
          ]}
        />
      </FlowSection>

      {/* 04: Proof and identity (Bone canvas) */}
      <FlowSection
        aria-label="Verifiable by design"
        style={{ backgroundColor: "var(--brand-bone)", color: "var(--brand-ink)" }}
      >
        <Eyebrow index="04">Verifiable by design</Eyebrow>
        <hr className="rule" />
        <div>
          <h2 className="display">
            Onchain
            <br />
            Identity
          </h2>
        </div>
        <hr className="rule" />
        <p className="max-w-[50ch] text-[clamp(1rem,2.5vw,2rem)] font-normal leading-relaxed">
          Ada is a real onchain agent, not a black box. Every claim is checkable.
        </p>
        <hr className="rule" />
        <ItemGrid
          items={[
            {
              label: "ERC-8004",
              body: "Registered and discoverable on agentscan and 8004scan, with a public capability profile.",
            },
            {
              label: "Self",
              body: "Agent identity verification ties Ada's wallet to a verifiable credential.",
            },
            {
              label: "x402",
              body: "Pay-per-call settlement is recorded on chain, so usage is auditable end to end.",
            },
          ]}
        />
      </FlowSection>

      {/* 05: Call to action (Ink canvas) */}
      <FlowSection
        aria-label="Get started"
        style={{ backgroundColor: "var(--brand-ink)", color: "var(--brand-white)" }}
      >
        <Eyebrow index="05">Get started</Eyebrow>
        <hr className="rule" />
        <div>
          <h2 className="display">
            Ready
            <br />
            To
            <br />
            <span style={{ color: "var(--brand-ember)" }}>Earn?</span>
          </h2>
        </div>
        <hr className="rule" />
        <p className="mt-auto max-w-[50ch] text-[clamp(1rem,2.5vw,2rem)] font-normal leading-relaxed">
          Connect your wallet, set one policy, and let Ada keep your stablecoins earning.
          Scroll back to the top to connect, or open the dashboard.
        </p>
      </FlowSection>
    </FlowArt>
  );
}
