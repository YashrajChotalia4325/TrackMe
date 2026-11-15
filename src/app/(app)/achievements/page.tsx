import { Briefcase, Clapperboard, Compass, Cpu, Dumbbell, Flame, Footprints, GraduationCap, Lock, NotebookPen, Send, ShieldCheck, Sparkles, Wallet, type LucideIcon } from "lucide-react";
import { getContext } from "@/server/context";
import { db } from "@/server/db";
import { totalXp } from "@/server/queries";
import { PageHeader, Panel } from "@/components/common/ui";
import { CircularProgress } from "@/components/ui/circular-progress";
import { ACHIEVEMENTS } from "@/lib/domain/achievements";
import { levelFor } from "@/lib/domain/scoring";
import { cn } from "@/lib/utils";

export const metadata = { title: "Achievements" };

const ICONS: Record<string, LucideIcon> = { Footprints, Flame, ShieldCheck, Compass, Cpu, Dumbbell, Briefcase, GraduationCap, Clapperboard, Wallet, NotebookPen, Send };

export default async function AchievementsPage() {
  const ctx = await getContext();
  const [earned, xp] = await Promise.all([db.userAchievement.findMany({ where: { userId: ctx.userId }, include: { achievement: true } }), totalXp(ctx.userId)]);
  const lvl = levelFor(xp);
  const have = new Map(earned.map((e) => [e.achievement.key, e.earnedAt]));

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Achievements" title={`Level ${lvl.level}`} description="Rewards for consistency — never for overwork. Rest days and approved skips never cost you anything here." />
      <Panel>
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <CircularProgress value={lvl.progress * 100} size={120} strokeWidth={10} showLabel ariaLabel={`Level ${lvl.level} progress`} renderLabel={() => <span className="text-2xl font-semibold">{lvl.level}</span>} />
          <div>
            <p className="tabular text-2xl font-semibold">{xp.toLocaleString("en-IN")} XP</p>
            <p className="text-sm text-muted-foreground">
              {lvl.next - lvl.current} XP to level {lvl.level + 1} · {earned.length}/{ACHIEVEMENTS.length} badges earned
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" /> XP comes from completed tasks (scaled by length, capped) and badges.
            </p>
          </div>
        </div>
      </Panel>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ACHIEVEMENTS.map((a) => {
          const at = have.get(a.key);
          const Icon = ICONS[a.icon] ?? Sparkles;
          return (
            <div key={a.key} className={cn("animate-rise flex items-start gap-3 rounded-2xl border p-4", at ? "border-primary/30 bg-primary/[0.06]" : "border-border bg-card")}>
              <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", at ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{at ? <Icon className="size-5" /> : <Lock className="size-4" />}</span>
              <div className="min-w-0">
                <p className={cn("font-medium", !at && "text-muted-foreground")}>{a.title}</p>
                <p className="text-xs text-muted-foreground">{a.description}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{at ? `Earned ${at.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · +${a.xp} XP` : `+${a.xp} XP`}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
