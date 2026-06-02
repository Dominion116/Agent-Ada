import { cn } from "@/lib/utils";

/**
 * Designed empty state. Per the consistency rules, every list ships one of
 * these instead of a bare blank panel: an eyebrow, a short line, one optional
 * action.
 */
export function EmptyState({
  eyebrow,
  title,
  description,
  action,
  icon,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/50 px-6 py-16 text-center",
        className,
      )}
    >
      {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      {eyebrow ? <p className="eyebrow text-muted-foreground">{eyebrow}</p> : null}
      <p className="text-base font-semibold">{title}</p>
      {description ? (
        <p className="max-w-[40ch] text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
