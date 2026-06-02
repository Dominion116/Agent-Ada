import { PageHeader } from "@/components/dashboard/section";
import { EmptyState } from "@/components/dashboard/empty-state";

export default function SettingsPage() {
  return (
    <div>
      <PageHeader eyebrow="Settings" title="Identity and account" />
      <EmptyState
        eyebrow="Coming next"
        title="Account settings are on their way"
        description="Your wallet, Ada's ERC-8004 registry id and Self status, links to agentscan and 8004scan, plus a clearly separated danger zone to wipe your data."
      />
    </div>
  );
}
