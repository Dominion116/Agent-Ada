import type { Chain } from "@ada/shared";
import { cn } from "@/lib/utils";
import { CHAIN_LABEL, CHAIN_COLOR } from "@/lib/format";

/** Chain marker: a colored dot plus the chain name. Color carries meaning, the
 *  word carries it too, so it never relies on color alone. */
export function NetworkBadge({ chain, className }: { chain: Chain; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider",
        className,
      )}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: CHAIN_COLOR[chain] }}
        aria-hidden
      />
      {CHAIN_LABEL[chain]}
    </span>
  );
}
