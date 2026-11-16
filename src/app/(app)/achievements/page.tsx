import { Briefcase, Clapperboard, Compass, Cpu, Dumbbell, Flame, Footprints, GraduationCap, Lock, NotebookPen, Send, ShieldCheck, Sparkles, Wallet, type LucideIcon } from "lucide-react";
import { getContext } from "@/server/context";
import { db } from "@/server/db";
import { totalXp } from "@/server/queries";
import { PageHeader, Panel } from "@/components/common/ui";
import { CircularProgress } from "@/components/ui/circular-progress";
import { ACHIEVEMENTS } from "@/lib/domain/achievements";
import { levelFor } from "@/lib/domain/scoring";
import { cn } from "@/lib/utils";
import { chip, dashed, display, eyebrow, num } from "@/components/config/bold";

export const metadata = { title: "Achievements" };

const ICONS: Record<string, LucideIcon> = { Footprints, Flame, ShieldCheck, Compass, Cpu, Dumbbell, Briefcase, GraduationCap, Clapperboard, Wallet, NotebookPen, Send };

/** Earned badges rotate through the block colours so the grid reads as a set of tiles. */
const EARNED_BLOCKS = ["bg-block-lime", "bg-block-sky", "bg-block-pink", "bg-block-sun", "bg-block-violet", "bg-block-orange", "bg-block-teal"];

export default async function AchievementsPage() {
  const ctx = await getContext();
  const [earned, xp] = await Promise.all([db.userAchievement.findMany({ where: { userId: ctx.userId }, include: { achievement: true } }), totalXp(ctx.userId)]);
  const lvl = levelFor(xp);
  const have = new Map(earned.map((e) => [e.achievement.key, e.earnedAt]));
  const toNext = lvl.next - lvl.current;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Achievements" title={`Level ${lvl.level}`} description="Rewards for consistency — never for overwork. Rest days and approved skips never cost you anything here." />
      <Panel>
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <CircularProgress
            value={lvl.progress * 100}
            size={128}
            strokeWidth={14}
            showLabel
            ariaLabel={`Level ${lvl.level}, ${Math.round(lvl.progress * 100)}% of the way to level ${lvl.level + 1}`}
            renderLabel={() => (
              <span className="flex flex-col items-center leading-none">
                <span className={eyebrow}>Level</span>
                <span className={cn(display, "mt-0.5 text-4xl")}>{lvl.level}</span>
              </span>
            )}
          />
          <div className="min-w-0 text-center sm:text-left">
            <p className={cn(display, "text-4xl leading-none sm:text-5xl")}>
              {xp.toLocaleString("en-IN")} <span className="text-2xl sm:text-3xl">XP</span>
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              <span className={cn(chip, "bg-block-lime px-2 py-1")}>
                <span className={num}>{toNext.toLocaleString("en-IN")}</span> XP to level {lvl.level + 1}
              </span>
              <span className={cn(chip, "bg-block-sun px-2 py-1")}>
                <span className={num}>
                  {earned.length}/{ACHIEVEMENTS.length}
                </span>{" "}
                badges earned
              </span>
            </div>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground sm:justify-start">
              <Sparkles className="size-3.5 shrink-0" aria-hidden /> XP comes from completed tasks (scaled by length, capped) and badges.
            </p>
          </div>
        </div>
      </Panel>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Badges">
        {ACHIEVEMENTS.map((a, i) => {
          const at = have.get(a.key);
          const Icon = ICONS[a.icon] ?? Sparkles;
          return (
            <li
              key={a.key}
              className={cn(
                "animate-rise flex items-start gap-3 p-4",
                at ? cn("rounded-[10px] border-2 border-border text-ink shadow-brutal", EARNED_BLOCKS[i % EARNED_BLOCKS.length]) : cn(dashed, "bg-background"),
              )}
            >
              <span
                className={cn("grid size-11 shrink-0 place-items-center rounded-[8px] border-2", at ? "border-ink bg-card text-ink dark:bg-[#FFFDF5]" : "border-dashed border-border text-muted-foreground")}
                aria-hidden
              >
                {at ? <Icon className="size-5" /> : <Lock className="size-4" />}
              </span>
              <div className="min-w-0">
                <p className={cn("font-display text-base font-extrabold tracking-[-0.01em]", !at && "text-muted-foreground")}>
                  {a.title}
                  <span className="sr-only">{at ? " (earned)" : " (locked)"}</span>
                </p>
                <p className={cn("text-xs", at ? "text-ink" : "text-muted-foreground")}>{a.description}</p>
                <p className={cn("mt-2 flex flex-wrap items-center gap-1.5 text-[11px]", at ? "text-ink" : "text-muted-foreground")}>
                  <span className={cn(chip, at ? "border-ink bg-card dark:bg-[#FFFDF5]" : "border-dashed bg-transparent text-muted-foreground")}>
                    <span className={num}>+{a.xp}</span> XP
                  </span>
                  {at && <span className="font-medium">Earned {at.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
