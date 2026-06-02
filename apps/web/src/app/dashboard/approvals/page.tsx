import { PageHeader } from "@/components/dashboard/section";
import { EmptyState } from "@/components/dashboard/empty-state";

export default function ApprovalsPage() {
  return (
    <div>
      <PageHeader eyebrow="Approvals" title="Quotes awaiting your call" />
      <EmptyState
        eyebrow="Nothing pending"
        title="No quotes waiting for approval"
        description="When a scan finds a rebalance that passes your policy, it lands here with the route cost, net gain, and an expiry countdown. Approve or reject with one tap."
      />
    </div>
  );
}
