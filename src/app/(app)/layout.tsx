import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { runMaintenance } from "@/server/maintenance";
import { db } from "@/server/db";
import { levelFor } from "@/lib/domain/scoring";
import { totalXp } from "@/server/queries";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await runMaintenance();
  if (!ctx.settings.onboardedAt) redirect("/onboarding");

  const [user, notifications, timer, xp] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: ctx.userId } }),
    db.notification.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.learningSession.findFirst({ where: { userId: ctx.userId, status: { in: ["RUNNING", "PAUSED"] } } }),
    totalXp(ctx.userId),
  ]);

  return (
    <AppShell
      user={{ name: ctx.name, email: user.email, image: user.image }}
      mode={ctx.mode}
      level={levelFor(xp).level}
      notifications={notifications.map((n) => ({ id: n.id, title: n.title, body: n.body, href: n.href, type: n.type, read: !!n.readAt, createdAt: n.createdAt.toISOString() }))}
      timer={
        timer
          ? { id: timer.id, status: timer.status as "RUNNING" | "PAUSED", accumulatedSec: timer.accumulatedSec, lastResumedAt: timer.lastResumedAt?.toISOString() ?? null, topic: timer.topic, taskId: timer.taskId }
          : null
      }
    >
      {children}
    </AppShell>
  );
}
