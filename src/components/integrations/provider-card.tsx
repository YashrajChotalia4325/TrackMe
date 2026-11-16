import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, PauseCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { chip, code, inset, stepNum } from "@/components/config/bold";

/**
 * Bold Blocks building blocks for the Integrations screen: a provider card with a block-coloured
 * header strip, status chips, numbered setup steps and note boxes. Server-safe (no client hooks).
 */

export type ProviderStatus = "connected" | "not-set-up" | "not-connected" | "paused" | "error";

const STATUS: Record<ProviderStatus, { label: string; block: string; icon: LucideIcon }> = {
  connected: { label: "Connected", block: "bg-block-lime", icon: CheckCircle2 },
  "not-set-up": { label: "Not set up", block: "bg-block-stone", icon: CircleDashed },
  "not-connected": { label: "Not connected", block: "bg-block-stone", icon: CircleDashed },
  paused: { label: "Paused", block: "bg-block-sun", icon: PauseCircle },
  error: { label: "Needs attention", block: "bg-block-danger", icon: AlertTriangle },
};

/**
 * Light-theme token scope for content sitting on a block-coloured strip: block fills keep ink text,
 * ink lines and paper controls in both themes, so buttons and chips placed there stay readable.
 * Works because the theme tokens are registered with @theme inline.
 */
const ON_STRIP =
  "[--foreground:#111111] [--muted-foreground:#111111] [--border:#111111] [--input:#111111] [--ring:#111111] [--ink:#111111] [--shadow-ink:#111111] [--card:#FFFDF5] [--background:#FFFDF5] [--muted:#F3EEE0] [--secondary:#F3EEE0] [--secondary-foreground:#111111] [--accent:#F3EEE0] [--accent-foreground:#111111] text-[#111111]";

/** Flat status chip: Connected = lime, Not set up = stone, Error = soft red. */
export function StatusChip({ status, label, className }: { status: ProviderStatus; label?: string; className?: string }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <span className={cn(chip, s.block, "px-2 py-1", className)}>
      <Icon className="size-3" aria-hidden />
      {label ?? s.label}
    </span>
  );
}

/** Provider card: ink-bordered card whose header is a flat block-coloured strip. */
export function ProviderCard({
  id,
  block,
  icon: Icon,
  title,
  description,
  status,
  statusLabel,
  action,
  children,
}: {
  id?: string;
  /** A bg-block-* class for the header strip. */
  block: string;
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  status?: ProviderStatus;
  statusLabel?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const titleId = `${id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-title`;
  return (
    <section id={id} aria-labelledby={titleId} className="animate-rise scroll-mt-20 overflow-hidden rounded-[10px] border-2 border-border bg-card shadow-brutal">
      <header className={cn("flex flex-wrap items-start justify-between gap-3 border-b-2 border-border px-4 py-3.5 text-ink sm:px-5", block)}>
        <div className={cn("flex min-w-0 items-start gap-3", ON_STRIP)}>
          <span className="grid size-10 shrink-0 place-items-center rounded-[8px] border-2 border-ink bg-[#FFFDF5] text-[#111111]" aria-hidden>
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-xl leading-tight font-extrabold tracking-[-0.02em]">
              {title}
            </h2>
            {description && <p className="mt-0.5 max-w-2xl text-sm text-ink">{description}</p>}
          </div>
        </div>
        {(status || action) && (
          <div className={cn("flex flex-wrap items-center justify-end gap-2", ON_STRIP)}>
            {status && <StatusChip status={status} label={statusLabel} />}
            {action}
          </div>
        )}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

/** Numbered setup guide with ink-bordered number squares. */
export function SetupStepList({ steps, className }: { steps: ReactNode[]; className?: string }) {
  return (
    <ol className={cn("grid gap-3 text-sm", className)}>
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className={stepNum} aria-hidden>
            {i + 1}
          </span>
          <span className="min-w-0 pt-0.5 text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">{s}</span>
        </li>
      ))}
    </ol>
  );
}

/** Inline code token for setup steps. */
export function Code({ children, wrap }: { children: ReactNode; wrap?: boolean }) {
  return <code className={cn(code, wrap && "break-all")}>{children}</code>;
}

/** Bordered note box. `safe` = teal icon tile (privacy), `warn` = sun, `error` = soft red, `info` = muted. */
export function Note({ icon: Icon, tone = "info", role, className, children }: { icon: LucideIcon; tone?: "safe" | "info" | "warn" | "error"; role?: "alert" | "status"; className?: string; children: ReactNode }) {
  const tile = tone === "safe" ? "bg-block-teal" : tone === "warn" ? "bg-block-sun" : tone === "error" ? "bg-block-danger" : "bg-card";
  return (
    <div role={role} className={cn(inset, "flex gap-3 p-3 text-xs", className)}>
      <span className={cn("grid size-6 shrink-0 place-items-center rounded-md border-2 border-border text-ink", tile)} aria-hidden>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 self-center text-foreground">{children}</div>
    </div>
  );
}
