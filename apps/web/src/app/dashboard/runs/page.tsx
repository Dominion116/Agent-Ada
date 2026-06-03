"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { RunMode, RunStatus } from "@ada/shared";
import { useRuns } from "@/hooks/use-agent-data";
import { PageHeader } from "@/components/dashboard/section";
import { EmptyState } from "@/components/dashboard/empty-state";
import { RunRow } from "@/components/dashboard/run-row";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

type ModeFilter = "all" | RunMode;
type StatusFilter = "all" | "completed" | "failed" | "pending";

const MODE_FILTERS: { value: ModeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "dry_run", label: "Dry run" },
];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "pending", label: "In progress" },
];

// Group the broad status filter onto the underlying run statuses.
function matchesStatus(status: RunStatus, filter: StatusFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "completed":
      return status === "completed" || status === "dry_run_complete";
    case "failed":
      return status === "failed";
    case "pending":
      return status === "pending" || status === "executing";
  }
}

function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="eyebrow text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-md border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors",
              value === opt.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function RunsPage() {
  const [page, setPage] = useState(0);
  const [mode, setMode] = useState<ModeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  const { runs, isLoading, error } = useRuns(true, PAGE_SIZE, page * PAGE_SIZE);

  // Filters apply to the current page. The server paginates by offset.
  const filtered = useMemo(
    () =>
      runs.filter(
        (r) => (mode === "all" || r.mode === mode) && matchesStatus(r.status, status),
      ),
    [runs, mode, status],
  );

  const hasNext = runs.length === PAGE_SIZE;
  const hasPrev = page > 0;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Runs" title="Every move Ada has made" />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <FilterChips label="Mode" options={MODE_FILTERS} value={mode} onChange={setMode} />
        <FilterChips label="Status" options={STATUS_FILTERS} value={status} onChange={setStatus} />
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load runs. The backend may not be reachable yet.
        </p>
      ) : null}

      {/* Loading skeletons */}
      {isLoading && runs.length === 0 ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[68px] animate-pulse rounded-xl border bg-card" />
          ))}
        </div>
      ) : null}

      {/* Empty states */}
      {!isLoading && runs.length === 0 ? (
        <EmptyState
          eyebrow="No runs yet"
          title="Ada has not run for this wallet"
          description="Dry runs and live executions appear here with their status, amount, and linked transaction hashes. Each row expands to the full transaction detail."
        />
      ) : null}

      {!isLoading && runs.length > 0 && filtered.length === 0 ? (
        <EmptyState
          eyebrow="No matches"
          title="No runs match these filters"
          description="Try widening the mode or status filters to see more of this page."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMode("all");
                setStatus("all");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : null}

      {/* Run list */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </div>
      ) : null}

      {/* Pagination */}
      {(hasPrev || hasNext) && runs.length > 0 ? (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={!hasPrev}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="eyebrow text-muted-foreground">Page {page + 1}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasNext}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
