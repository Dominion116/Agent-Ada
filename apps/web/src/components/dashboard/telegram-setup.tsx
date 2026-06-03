"use client";

import { useState } from "react";
import { Check, ExternalLink, MessageCircle } from "lucide-react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3;
type Prefs = { dry_run: boolean; executed: boolean; error: boolean };

const STEP_LABELS = ["Create bot", "Connect", "Confirm"];

const COMMANDS: { cmd: string; action: string }[] = [
  { cmd: "/start", action: "Begin onboarding and link your wallet" },
  { cmd: "/balance", action: "Show your stablecoin balances" },
  { cmd: "yields", action: "List the top yields right now" },
  { cmd: "save N / save all", action: "Build a quote and await your approval" },
  { cmd: "unwind", action: "Withdraw your position back to your wallet" },
  { cmd: "status", action: "Latest run summary and active policy" },
  { cmd: "stop", action: "Engage the kill switch immediately" },
];

function StepDots({ step }: { step: Step }) {
  return (
    <ol className="flex flex-wrap items-center gap-3">
      {STEP_LABELS.map((label, i) => {
        const n = (i + 1) as Step;
        const done = step > n;
        const active = step === n;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                done
                  ? "bg-success text-white"
                  : active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="h-4 w-4" /> : n}
            </span>
            <span
              className={cn(
                "text-sm font-semibold",
                active || done ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {i < STEP_LABELS.length - 1 ? <span className="hidden h-px w-6 bg-border sm:block" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function PrefRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function TelegramSetup() {
  const [step, setStep] = useState<Step>(1);
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [prefs, setPrefs] = useState<Prefs>({ dry_run: true, executed: true, error: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prefList = (Object.entries(prefs) as [keyof Prefs, boolean][])
    .filter(([, v]) => v)
    .map(([k]) => k);

  const tokenValid = /^\d{6,}:[\w-]{20,}$/.test(token.trim());
  const chatIdValid = /^-?\d{3,}$/.test(chatId.trim());

  async function handleSave() {
    setError(null);
    if (!tokenValid) {
      setError("That does not look like a BotFather token. It looks like 123456789:ABC...");
      return;
    }
    if (!chatIdValid) {
      setError("Enter the numeric chat id your bot should message.");
      return;
    }
    setSaving(true);
    try {
      const res = await api.saveTelegram(token.trim(), chatId.trim(), prefList);
      if (!res.ok) throw new Error("The server rejected the configuration.");
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your bot. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function revoke() {
    setToken("");
    setChatId("");
    setPrefs({ dry_run: true, executed: true, error: true });
    setError(null);
    setStep(1);
  }

  return (
    <div className="space-y-6">
      <StepDots step={step} />

      {/* Step 1: create a bot */}
      {step === 1 ? (
        <Card className="space-y-5 p-6">
          <div>
            <p className="eyebrow text-muted-foreground">Step 1</p>
            <h2 className="mt-1 text-lg font-bold">Create your bot with BotFather</h2>
          </div>
          <ol className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <li>
              <span className="font-semibold text-foreground">1.</span> Open Telegram and message{" "}
              <span className="font-semibold text-foreground">@BotFather</span>.
            </li>
            <li>
              <span className="font-semibold text-foreground">2.</span> Send{" "}
              <span className="font-semibold text-foreground">/newbot</span> and follow the prompts to
              name your bot.
            </li>
            <li>
              <span className="font-semibold text-foreground">3.</span> Copy the token BotFather gives
              you. It looks like{" "}
              <span className="font-mono text-foreground">123456789:ABCdef...</span>.
            </li>
          </ol>
          <div className="flex flex-wrap items-center gap-4">
            <Button onClick={() => setStep(2)}>I have my token</Button>
            <a
              href="https://core.telegram.org/bots/features#botfather"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              Read the BotFather guide <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </Card>
      ) : null}

      {/* Step 2: connect token + chat id + preferences */}
      {step === 2 ? (
        <Card className="space-y-6 p-6">
          <div>
            <p className="eyebrow text-muted-foreground">Step 2</p>
            <h2 className="mt-1 text-lg font-bold">Connect your bot</h2>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bot-token">Bot token</Label>
            <p className="text-xs text-muted-foreground">
              Pasted from BotFather. Stored encrypted on the server and never shown again.
            </p>
            <Input
              id="bot-token"
              type="password"
              autoComplete="off"
              placeholder="123456789:ABCdef..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="chat-id">Chat id</Label>
            <p className="text-xs text-muted-foreground">
              Message your new bot once, then it can reach you. Use your numeric chat id (a negative
              number for groups).
            </p>
            <Input
              id="chat-id"
              inputMode="numeric"
              placeholder="123456789"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
            />
          </div>

          <div>
            <p className="eyebrow mb-1 text-muted-foreground">Notify me about</p>
            <PrefRow
              label="Dry runs"
              hint="When Ada simulates a rebalance for review."
              checked={prefs.dry_run}
              onChange={(v) => setPrefs((p) => ({ ...p, dry_run: v }))}
            />
            <PrefRow
              label="Executions"
              hint="When a live rebalance completes."
              checked={prefs.executed}
              onChange={(v) => setPrefs((p) => ({ ...p, executed: v }))}
            />
            <PrefRow
              label="Errors"
              hint="When a run fails or is blocked."
              checked={prefs.error}
              onChange={(v) => setPrefs((p) => ({ ...p, error: v }))}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save and send test"}
            </Button>
            <Button variant="ghost" onClick={() => setStep(1)} disabled={saving}>
              Back
            </Button>
          </div>
        </Card>
      ) : null}

      {/* Step 3: confirmation + command reference */}
      {step === 3 ? (
        <div className="space-y-6">
          <Card className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success/15 text-success">
                <Check className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold">Your bot is linked</h2>
                <p className="text-sm text-muted-foreground">
                  A test message was sent to your chat. If it arrived, you are all set.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow text-muted-foreground">Notifications</span>
              {prefList.length > 0 ? (
                prefList.map((p) => (
                  <Badge key={p} variant="info">
                    {p === "dry_run" ? "Dry runs" : p === "executed" ? "Executions" : "Errors"}
                  </Badge>
                ))
              ) : (
                <Badge variant="neutral">None</Badge>
              )}
            </div>

            <div className="flex flex-wrap gap-3 pt-1">
              <Button variant="outline" onClick={() => setStep(2)}>
                Edit configuration
              </Button>
              <Button variant="ghost" onClick={revoke}>
                Revoke bot
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
              <p className="eyebrow text-muted-foreground">Command reference</p>
            </div>
            <ul className="divide-y">
              {COMMANDS.map((c) => (
                <li key={c.cmd} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <code className="rounded bg-muted px-2 py-1 text-xs font-semibold">{c.cmd}</code>
                  <span className="flex-1 text-right text-sm text-muted-foreground">{c.action}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
