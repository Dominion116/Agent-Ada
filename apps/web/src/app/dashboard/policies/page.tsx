import { PageHeader } from "@/components/dashboard/section";
import { EmptyState } from "@/components/dashboard/empty-state";

export default function PoliciesPage() {
  return (
    <div>
      <PageHeader eyebrow="Policies" title="The rules Ada acts within" />
      <EmptyState
        eyebrow="Coming next"
        title="Policy editor is on its way"
        description="Set the minimum net gain, the maximum route cost, cooldowns, and which chains and venues Ada may use. The kill switch stops all activity at once."
      />
    </div>
  );
}
