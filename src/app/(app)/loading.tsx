import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder blocks follow the Bold Blocks shapes: ink-bordered muted tiles with 10px corners. */
const BLOCK = "rounded-[10px] border-2 border-ink bg-muted motion-reduce:animate-none";

export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div aria-hidden className="space-y-2.5">
        <Skeleton className="h-3 w-32 rounded-[4px] bg-muted motion-reduce:animate-none" />
        <Skeleton className="h-9 w-72 max-w-full rounded-[6px] bg-muted motion-reduce:animate-none" />
      </div>
      <div aria-hidden className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className={`h-28 ${BLOCK}`} />
        ))}
      </div>
      <div aria-hidden className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Skeleton className={`h-80 ${BLOCK}`} />
        <Skeleton className={`h-80 ${BLOCK}`} />
      </div>
    </div>
  );
}
