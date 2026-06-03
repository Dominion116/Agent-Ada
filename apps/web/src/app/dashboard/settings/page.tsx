"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { Chain } from "@ada/shared";
import { useProfile } from "@/hooks/use-agent-data";
import { useWallet } from "@/hooks/use-wallet";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { PageHeader, Section } from "@/components/dashboard/section";
import { NetworkBadge } from "@/components/dashboard/network-badge";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { truncateAddress } from "@/lib/utils";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <p className="eyebrow text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { profile } = useProfile();
  const { address } = useWallet();
  const { signOut } = useAuth();
  const router = useRouter();

  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable; silently ignore.
    }
  }

  async function deleteData() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteAllData();
      signOut();
      router.replace("/");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete your data.");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Settings" title="Identity and account" />

      {/* Account */}
      <Section eyebrow="Account">
        <Card className="divide-y p-6 py-2">
          <Row label="Wallet address">
            {address ? (
              <>
                <span className="font-mono text-sm tabular-nums">{truncateAddress(address, 6)}</span>
                <button
                  type="button"
                  onClick={copyAddress}
                  aria-label="Copy wallet address"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </button>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Not connected</span>
            )}
          </Row>

          <Row label="Self Agent ID">
            {profile?.selfAgentId ? (
              <Badge variant="success">
                <ShieldCheck className="h-3.5 w-3.5" />
                Verified
              </Badge>
            ) : (
              <>
                <Badge variant="warning">Not verified</Badge>
                <a
                  href="https://self.xyz"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline"
                >
                  Verify <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </>
            )}
          </Row>
        </Card>
      </Section>

      {/* Ada profile */}
      <Section eyebrow="Ada profile">
        <Card className="divide-y p-6 py-2">
          <Row label="Name">
            <span className="text-sm font-semibold">{profile?.name ?? "Ada"}</span>
          </Row>

          <Row label="ERC-8004 registry id">
            <span className="font-mono text-sm">
              {profile?.erc8004RegistryId ?? "Not registered"}
            </span>
          </Row>

          <Row label="Self Agent ID">
            <span className="font-mono text-sm">{profile?.selfAgentId ?? "Pending"}</span>
          </Row>

          <Row label="Explorers">
            <a
              href="https://agentscan.xyz"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              agentscan <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <a
              href="https://8004scan.xyz"
              target="_blank"
              rel="noreferrer"
              className="ml-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              8004scan <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Row>

          {profile?.chains && profile.chains.length > 0 ? (
            <Row label="Supported chains">
              <div className="flex flex-wrap gap-3">
                {profile.chains.map((c) => (
                  <NetworkBadge key={c} chain={c as Chain} />
                ))}
              </div>
            </Row>
          ) : null}
        </Card>
      </Section>

      {/* Legal */}
      <Section eyebrow="Legal">
        <Card className="p-6">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Ada surfaces yield data and acts only within the policy you set. It does not provide
            financial advice. You are responsible for the funds and rules you configure.
          </p>
        </Card>
      </Section>

      {/* Danger zone */}
      <Section eyebrow="Danger zone">
        <Card className="space-y-4 border-destructive/50 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
            <div>
              <p className="text-sm font-semibold">Delete all my data</p>
              <p className="mt-1 max-w-[60ch] text-xs leading-relaxed text-muted-foreground">
                Permanently removes every record tied to your wallet: policies, quotes, runs, chat
                history, and your Telegram configuration. This cannot be undone.
              </p>
            </div>
          </div>

          {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}

          {!confirming ? (
            <Button variant="destructive" onClick={() => setConfirming(true)}>
              <Trash2 className="h-4 w-4" />
              Delete all my data
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold">Are you sure? This is permanent.</span>
              <Button variant="destructive" onClick={deleteData} disabled={deleting}>
                {deleting ? "Deleting…" : "Yes, delete everything"}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={deleting}>
                Cancel
              </Button>
            </div>
          )}
        </Card>
      </Section>
    </div>
  );
}
