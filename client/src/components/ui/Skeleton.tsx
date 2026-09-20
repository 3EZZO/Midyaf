import { cn } from "../../lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-lg bg-surface-3", className)} aria-hidden />;
}

export function SkeletonKpiRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-busy>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-hairline bg-surface-2 p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-8 w-32" />
          <Skeleton className="mt-3 h-3 w-40" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-surface-2" aria-busy>
      <div className="flex gap-4 border-b border-hairline bg-surface-1 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b border-hairline px-4 py-3 last:border-b-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Full-portal placeholder used as the Suspense fallback while a portal chunk loads. */
export function PortalSkeleton() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6" aria-busy aria-label="Loading">
      <div>
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-3 h-8 w-96 max-w-full" />
        <Skeleton className="mt-3 h-4 w-72 max-w-full" />
      </div>
      <SkeletonKpiRow />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-lg border border-hairline bg-surface-2 p-5">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-5 h-64 w-full" />
        </div>
        <SkeletonTable rows={6} cols={3} />
      </div>
    </div>
  );
}
