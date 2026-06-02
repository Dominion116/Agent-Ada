import { PageHeader } from "@/components/dashboard/section";
import { EmptyState } from "@/components/dashboard/empty-state";

export default function TelegramPage() {
  return (
    <div>
      <PageHeader eyebrow="Telegram" title="Run Ada from chat" />
      <EmptyState
        eyebrow="Coming next"
        title="Telegram setup is on its way"
        description="Create a bot with BotFather, paste the token, and Ada notifies you of every dry run and execution. Approve, pause, or check balances without opening the dashboard."
      />
    </div>
  );
}
