import { PageHeader } from "@/components/dashboard/section";
import { TelegramSetup } from "@/components/dashboard/telegram-setup";

export default function TelegramPage() {
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Telegram" title="Run Ada from chat" />
      <TelegramSetup />
    </div>
  );
}
