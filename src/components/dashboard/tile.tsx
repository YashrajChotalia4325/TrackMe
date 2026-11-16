import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { focusRing } from "@/components/dashboard/blocks";
import { cn } from "@/lib/utils";

/*
 * Dashboard tiles (Bold Blocks).
 *
 * "card" is the default white tile: 2px ink border, 10px radius, 4px hard shadow.
 * "lime" is the hero tile: lime fill, 3px ink border, 6px hard shadow, literal ink text so it
 * reads the same in both themes (the outline and shadow still follow the theme).
 */
export function DashTile({
  id,
  title,
  description,
  action,
  tone = "card",
  children,
  className,
  bodyClassName,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: "card" | "lime";
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const hero = tone === "lime";
  const headingId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        "animate-rise min-w-0 rounded-[10px] border-ink",
        hero ? "border-[3px] bg-block-lime text-[#111111] shadow-brutal-lg" : "border-2 bg-card text-card-foreground shadow-brutal",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="min-w-0">
          <h2 id={headingId} className="font-display text-lg leading-tight font-extrabold tracking-[-0.02em] sm:text-xl">
            {title}
          </h2>
          {description && <p className={cn("mt-1 text-[13px] leading-snug", hero ? "text-[#111111]/75" : "text-muted-foreground")}>{description}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center">{action}</div>}
      </header>
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Small ink-bordered link used in tile headers ("Planner", "Calendar", ...). */
export function TileLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "press inline-flex items-center gap-1 rounded-[8px] border-2 border-ink bg-card px-2 py-1 text-xs font-semibold text-foreground shadow-brutal-sm hover:bg-muted",
        focusRing,
      )}
    >
      {children}
      <ArrowUpRight className="size-3.5" aria-hidden />
    </Link>
  );
}

/** Square category swatch: flat block colour with an ink edge. Pass a bg-block-* class. */
export function Swatch({ className }: { className: string }) {
  return <span aria-hidden className={cn("inline-block size-3 shrink-0 rounded-[3px] border-2 border-ink", className)} />;
}
