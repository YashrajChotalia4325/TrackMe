import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2 text-muted-foreground">{eyebrow}</p>}
        <h1 className="font-display text-[32px] leading-[1.05] font-extrabold tracking-[-0.03em] text-balance sm:text-[40px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, description, action, children, className, bodyClassName, id }: { title?: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; id?: string }) {
  return (
    <section id={id} className={cn("animate-rise rounded-[10px] border-2 border-ink bg-card text-card-foreground shadow-brutal", className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            {title && <h2 className="font-display text-lg leading-tight font-extrabold tracking-[-0.01em]">{title}</h2>}
            {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, icon: Icon, tone, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; tone?: "accent" | "success" | "warning" | "danger"; className?: string }) {
  const toneClass = tone === "accent" ? "text-primary" : tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <div className={cn("animate-rise rounded-[10px] border-2 border-ink bg-card p-4 text-card-foreground shadow-brutal", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow min-w-0 truncate text-muted-foreground">{label}</p>
        {Icon && (
          <span className="grid size-7 shrink-0 place-items-center rounded-[6px] border-2 border-ink bg-muted text-foreground" aria-hidden>
            <Icon className="size-3.5" strokeWidth={2.5} />
          </span>
        )}
      </div>
      <p className={cn("tabular mt-3 font-display text-[32px] leading-none font-extrabold tracking-[-0.03em] sm:text-[36px]", toneClass)}>{value}</p>
      {hint && <p className="mt-2 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon?: LucideIcon; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-[10px] border-2 border-dashed border-ink bg-background px-6 py-10 text-center", className)}>
      {Icon && (
        <span className="mb-3 grid size-11 place-items-center rounded-[8px] border-2 border-ink bg-card text-foreground shadow-brutal-sm">
          <Icon className="size-5" strokeWidth={2.25} aria-hidden />
        </span>
      )}
      <p className="font-display text-base leading-tight font-extrabold tracking-[-0.01em]">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-[13px] text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Bar({ value, max, color, className, label }: { value: number; max: number; color?: string; className?: string; label?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cn("h-2.5 w-full overflow-hidden rounded-full border-2 border-ink bg-card", className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      <div className={cn("h-full bg-primary transition-[width] duration-700 ease-out motion-reduce:transition-none", pct > 0 && pct < 100 && "border-r-2 border-ink")} style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function CategoryDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-full border-[1.5px] border-ink", className)} style={{ background: color }} aria-hidden />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-[5px] border-[1.5px] border-ink bg-card px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground tabular-nums shadow-[1px_1px_0_0_var(--shadow-ink)]">{children}</kbd>;
}
