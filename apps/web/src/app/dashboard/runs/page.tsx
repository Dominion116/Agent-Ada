import { PageHeader } from "@/components/dashboard/section";
import { EmptyState } from "@/components/dashboard/empty-state";

export default function RunsPage() {
  return (
    <div>
      <PageHeader eyebrow="Runs" title="Every move Ada has made" />
      <EmptyState
        eyebrow="No runs yet"
        title="Ada has not run for this wallet"
        description="Dry runs and live executions appear here with their status, amount, and linked transaction hashes. Each row expands to the full transaction detail."
      />
    </div>
  );
}
