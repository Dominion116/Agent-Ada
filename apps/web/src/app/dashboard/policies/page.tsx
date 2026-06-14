"use client";

import { useEffect, useState } from "react";
import type { Policy, PolicyUpdate } from "@ada/shared";
import { usePolicy } from "@/hooks/use-agent-data";
import { api } from "@/lib/api";
import { PageHeader, Section } from "@/components/dashboard/section";
import { PolicyForm } from "@/components/dashboard/policy-form";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { bpsToPercent } from "@/lib/utils";

// Mirrors DefaultPolicy in @ada/shared (kept inline: see feedback-web-type-only-shared-imports).
const DEFAULT_POLICY: PolicyUpdate = {
  min_net_gain_bps: 50,
  max_route_cost_bps: 150,
  cooldown_hours: 24,
  allowed_chains: ["celo"],
  allowed_venues: ["moola"],
  kill_switch: false,
};

function HistoryRow({ policy, active }: { policy: Policy; active: boolean }) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex items-center gap-3">
        <Badge variant={active ? "info" : "neutral"}>{active ? "Active" : `v${policy.version}`}</Badge>
        <span className="text-sm text-muted-foreground">
          {new Date(policy.created_at).toLocaleString()}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground tabular-nums">
        <span>Gain {bpsToPercent(policy.min_net_gain_bps)}</span>
        <span>Cost {bpsToPercent(policy.max_route_cost_bps)}</span>
        <span>Cooldown {policy.cooldown_hours}h</span>
        <span>{policy.allowed_chains.length} chains</span>
        {policy.kill_switch ? <span className="text-destructive">Kill switch on</span> : null}
      </div>
    </Card>
  );
}

export default function PoliciesPage() {
  const { policy, isLoading, error, mutate } = usePolicy(true);
  const [history, setHistory] = useState<Policy[]>([]);

  // Seed the history once the active policy first loads.
  useEffect(() => {
    if (policy && history.length === 0) setHistory([policy]);
  }, [policy, history.length]);

  async function handleSave(update: PolicyUpdate): Promise<Policy> {
    const { policy: saved } = await api.updatePolicy(update);
    // Newest first, de-duped by version.
    setHistory((prev) => [saved, ...prev.filter((p) => p.version !== saved.version)]);
    await mutate();
    return saved;
  }

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Policies" title="The rules Ada acts within" />

      {error ? (
        <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load your policy. The backend may not be reachable yet.
        </p>
      ) : null}

      {isLoading && !policy ? (
        <div className="space-y-6">
          <div className="h-72 animate-pulse rounded-xl border bg-card" />
          <div className="h-24 animate-pulse rounded-xl border bg-card" />
        </div>
      ) : null}

      {policy ? (
        <>
          {/* key rebinds the form to the latest version after a save */}
          <PolicyForm key={policy.version} initial={policy} onSave={handleSave} />

          <Section eyebrow="Version history">
            {history.length > 0 ? (
              <div className="space-y-3">
                {history.map((p, i) => (
                  <HistoryRow key={p.version} policy={p} active={i === 0} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No earlier versions"
                description="Each time you save, the new policy version is recorded here."
              />
            )}
          </Section>
        </>
      ) : null}

      {!isLoading && !policy && !error ? (
        <Section eyebrow="No policy yet">
          <p className="max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
            Define the rules Ada acts within. Once saved, every scan and execution is checked
            against them.
          </p>
          <PolicyForm initial={DEFAULT_POLICY} onSave={handleSave} />
        </Section>
      ) : null}
    </div>
  );
}
