import { cn } from "@/lib/utils";

/**
 * Page header for every dashboard screen: an uppercase eyebrow, a heading, an
 * optional right-aligned action, then a hairline rule. Mirrors the rhythm of a
 * landing band at fixed product density, so screens feel connected.
 */
export function PageHeader({
  eyebrow,
  title,
  action,
  className,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-8", className)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-muted-foreground">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        </div>
        {action}
      </div>
      <hr className="rule mt-5 text-border opacity-100" />
    </header>
  );
}

/** A labeled sub-section within a page. */
export function Section({
  eyebrow,
  children,
  className,
}: {
  eyebrow?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      {eyebrow ? <p className="eyebrow text-muted-foreground">{eyebrow}</p> : null}
      {children}
    </section>
  );
}
