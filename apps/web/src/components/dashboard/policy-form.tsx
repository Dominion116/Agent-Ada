"use client";

import { useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import type { Chain, Policy, PolicyUpdate, Venue } from "@ada/shared";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { bpsToPercent, cn } from "@/lib/utils";
import { CHAIN_LABEL, VENUE_LABEL } from "@/lib/format";

const ALL_CHAINS: Chain[] = ["celo", "base", "polygon", "arbitrum", "optimism"];
const ALL_VENUES: Venue[] = ["moola", "aave-v3"];

type FieldErrors = Partial<Record<keyof PolicyUpdate, string>>;

// Mirrors the server PolicyUpdateSchema (non-negative integers). Kept inline so
// the browser bundle stays free of the shared package's server-only runtime.
function validateInt(raw: string): { value?: number; error?: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { error: "Required" };
  const n = Number(trimmed);
  if (!Number.isInteger(n)) return { error: "Must be a whole number" };
  if (n < 0) return { error: "Must be zero or more" };
  return { value: n };
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
      {children}
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Number-to-percent hint that stays quiet on invalid input. */
function pct(raw: string): string {
  const n = Number(raw);
  return Number.isFinite(n) && raw.trim() !== "" ? `= ${bpsToPercent(n)}` : "";
}

export function PolicyForm({
  initial,
  onSave,
}: {
  initial: PolicyUpdate;
  onSave: (update: PolicyUpdate) => Promise<Policy>;
}) {
  const [minGain, setMinGain] = useState(String(initial.min_net_gain_bps));
  const [maxCost, setMaxCost] = useState(String(initial.max_route_cost_bps));
  const [cooldown, setCooldown] = useState(String(initial.cooldown_hours));
  const [chains, setChains] = useState<Chain[]>(initial.allowed_chains);
  const [venues, setVenues] = useState<Venue[]>(initial.allowed_venues);
  const [kill, setKill] = useState(initial.kill_switch);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSavedVersion(null);

    const gain = validateInt(minGain);
    const cost = validateInt(maxCost);
    const cool = validateInt(cooldown);

    const next: FieldErrors = {};
    if (gain.error) next.min_net_gain_bps = gain.error;
    if (cost.error) next.max_route_cost_bps = cost.error;
    if (cool.error) next.cooldown_hours = cool.error;
    if (chains.length === 0) next.allowed_chains = "Pick at least one chain.";
    if (venues.length === 0) next.allowed_venues = "Pick at least one venue.";

    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    const update: PolicyUpdate = {
      min_net_gain_bps: gain.value!,
      max_route_cost_bps: cost.value!,
      cooldown_hours: cool.value!,
      allowed_chains: chains,
      allowed_venues: venues,
      kill_switch: kill,
    };

    setErrors({});
    setSaving(true);
    try {
      const saved = await onSave(update);
      setSavedVersion(saved.version);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save the policy.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card className="space-y-6 p-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            label="Minimum net gain (bps)"
            htmlFor="min-gain"
            hint="The smallest yield improvement, after all fees, that justifies a move."
            error={errors.min_net_gain_bps}
          >
            <Input
              id="min-gain"
              inputMode="numeric"
              value={minGain}
              onChange={(e) => setMinGain(e.target.value)}
            />
            <p className="text-xs text-muted-foreground tabular-nums">{pct(minGain)}</p>
          </Field>

          <Field
            label="Maximum route cost (bps)"
            htmlFor="max-cost"
            hint="The most you will accept in bridge and slippage cost for a single move."
            error={errors.max_route_cost_bps}
          >
            <Input
              id="max-cost"
              inputMode="numeric"
              value={maxCost}
              onChange={(e) => setMaxCost(e.target.value)}
            />
            <p className="text-xs text-muted-foreground tabular-nums">{pct(maxCost)}</p>
          </Field>
        </div>

        <Field
          label="Cooldown (hours)"
          htmlFor="cooldown"
          hint="The minimum time between two consecutive rebalances."
          error={errors.cooldown_hours}
        >
          <Input
            id="cooldown"
            inputMode="numeric"
            className="sm:max-w-[200px]"
            value={cooldown}
            onChange={(e) => setCooldown(e.target.value)}
          />
        </Field>

        <Field
          label="Allowed chains"
          hint="Ada may only move funds to these networks."
          error={errors.allowed_chains}
        >
          <div className="flex flex-wrap gap-2">
            {ALL_CHAINS.map((c) => (
              <Chip key={c} active={chains.includes(c)} onClick={() => setChains(toggle(chains, c))}>
                {CHAIN_LABEL[c]}
              </Chip>
            ))}
          </div>
        </Field>

        <Field
          label="Allowed venues"
          hint="Ada may only supply into these lending venues."
          error={errors.allowed_venues}
        >
          <div className="flex flex-wrap gap-2">
            {ALL_VENUES.map((v) => (
              <Chip key={v} active={venues.includes(v)} onClick={() => setVenues(toggle(venues, v))}>
                {VENUE_LABEL[v]}
              </Chip>
            ))}
          </div>
        </Field>
      </Card>

      {/* Kill switch: separated and styled as the danger control it is. */}
      <Card
        className={cn(
          "flex flex-wrap items-center justify-between gap-4 p-6",
          kill && "border-destructive ring-1 ring-destructive",
        )}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle
            className={cn("mt-0.5 h-5 w-5", kill ? "text-destructive" : "text-muted-foreground")}
          />
          <div>
            <Label htmlFor="kill-switch">Kill switch</Label>
            <p className="mt-1 max-w-[48ch] text-xs leading-relaxed text-muted-foreground">
              When on, Ada stops all activity immediately. No scans, no quotes, no executions,
              until you turn it off.
            </p>
          </div>
        </div>
        <Switch
          id="kill-switch"
          checked={kill}
          onCheckedChange={setKill}
          className="data-[state=checked]:bg-destructive"
        />
      </Card>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? "Saving…" : "Save policy"}
        </Button>
        {savedVersion !== null ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
            <Check className="h-4 w-4" />
            Saved as version {savedVersion}
          </span>
        ) : null}
        {formError ? <span className="text-sm text-destructive">{formError}</span> : null}
      </div>
    </form>
  );
}
