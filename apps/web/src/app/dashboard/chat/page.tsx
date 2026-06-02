import { PageHeader } from "@/components/dashboard/section";
import { EmptyState } from "@/components/dashboard/empty-state";

export default function ChatPage() {
  return (
    <div>
      <PageHeader eyebrow="Chat" title="Talk to Ada" />
      <EmptyState
        eyebrow="Coming next"
        title="Conversational control is on its way"
        description="Ask for yields, check your balance, or trigger a rebalance in plain language. Quotes render inline so you can approve them without leaving the thread."
      />
    </div>
  );
}
