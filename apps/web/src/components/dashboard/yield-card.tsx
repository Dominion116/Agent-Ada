import type { YieldData } from "@ada/shared";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NetworkBadge } from "@/components/dashboard/network-badge";
import { bpsToPercent, cn } from "@/lib/utils";
import { VENUE_LABEL, timeAgo } from "@/lib/format";

/**
 * One yield opportunity: chain, venue, asset, supply APR. The `highlight` flag
 * marks the current position or the best alternative with a Signal Blue edge.
 */
export function YieldCard({
  data,
  label,
  highlight = false,
  className,
}: {
  data: YieldData;
  label?: string;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "flex flex-col gap-4 p-6",
        highlight && "border-primary ring-1 ring-primary",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <NetworkBadge chain={data.chain} />
        {label ? <Badge variant={highlight ? "info" : "neutral"}>{label}</Badge> : null}
      </div>

      <div>
        <p className="text-4xl font-bold tracking-tight tabular-nums">
          {bpsToPercent(data.supply_rate_bps)}
        </p>
        <p className="mt-1 eyebrow text-muted-foreground">Supply APR</p>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">
          {VENUE_LABEL[data.venue]} · {data.asset}
        </span>
        <span className="text-muted-foreground">{timeAgo(data.last_updated)}</span>
      </div>
    </Card>
  );
}
