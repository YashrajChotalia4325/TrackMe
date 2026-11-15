import Link from "next/link";
import { ChevronLeft, ChevronRight, PiggyBank, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { getContext } from "@/server/context";
import { db } from "@/server/db";
import type { LucideIcon } from "lucide-react";
import { Bar, PageHeader, Panel } from "@/components/common/ui";
import { Bars, Donut } from "@/components/charts/charts";
import { FundTargetForm, TransactionForm, TransactionList } from "@/components/trackers/finance";
import { inr } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { addMonths, formatMonth, monthKey, monthRange } from "@/lib/time";
import { BLOCK, card, chip, display, num } from "@/components/config/bold";
import { cn } from "@/lib/utils";

export const metadata = { title: "Finance" };

const PALETTE = [BLOCK.sky, BLOCK.pink, BLOCK.sun, BLOCK.violet, BLOCK.lime, BLOCK.orange, BLOCK.teal, BLOCK.stone, BLOCK.danger];

/** Money figure tile: block-coloured chip label over a big display figure. */
function MoneyTile({ label, value, hint, icon: Icon, block, negative }: { label: string; value: string; hint?: string; icon: LucideIcon; block: string; negative?: boolean }) {
  return (
    <div className={cn(card, "animate-rise flex min-w-0 flex-col gap-3 p-4")}>
      <span className={cn(chip, block, "self-start px-2 py-1 tracking-[0.06em] uppercase")}>
        <Icon className="size-3.5" aria-hidden /> {label}
      </span>
      <p className={cn(display, "truncate text-3xl leading-none sm:text-[34px]", negative && "text-destructive")}>{value}</p>
      {hint && <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default async function FinancePage({ searchParams }: PageProps<"/finance">) {
  const ctx = await getContext();
  const sp = await searchParams;
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : monthKey(ctx.today);
  const { start, end } = monthRange(month);
  const sixStart = monthRange(addMonths(month, -5)).start;
  const [all, recent] = await Promise.all([
    db.financialTransaction.findMany({ where: { userId: ctx.userId }, select: { type: true, amount: true } }),
    db.financialTransaction.findMany({ where: { userId: ctx.userId, date: { gte: sixStart, lte: end } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
  ]);
  const monthTx = recent.filter((t) => t.date >= start && t.date <= end);
  const total = (type: string, list = monthTx) => list.filter((t) => t.type === type).reduce((s, t) => s + Number(t.amount), 0);
  const income = total("INCOME");
  const expense = total("EXPENSE");
  const saved = total("SAVING") + total("INVESTMENT");
  const savingsRate = income > 0 ? Math.round((saved / income) * 100) : null;
  const fundSaved = all.filter((t) => t.type === "SAVING").reduce((s, t) => s + Number(t.amount), 0);
  const fundTarget = ctx.settings.emergencyFundTarget ? Number(ctx.settings.emergencyFundTarget) : null;
  const monthlyTarget = ctx.settings.monthlySavingsTarget ? Number(ctx.settings.monthlySavingsTarget) : null;

  const byCat = new Map<string, number>();
  for (const t of monthTx.filter((t) => t.type === "EXPENSE")) byCat.set(t.category, (byCat.get(t.category) ?? 0) + Number(t.amount));
  const donut = [...byCat.entries()].map(([name, value], i) => ({ name, value: Math.round(value), color: PALETTE[i % PALETTE.length] }));

  const six = Array.from({ length: 6 }, (_, i) => {
    const m = addMonths(month, i - 5);
    const r = monthRange(m);
    const list = recent.filter((t) => t.date >= r.start && t.date <= r.end);
    return { label: formatMonth(m).slice(0, 3), income: Math.round(total("INCOME", list)), expense: Math.round(total("EXPENSE", list)), saved: Math.round(total("SAVING", list) + total("INVESTMENT", list)) };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance · INR"
        title={formatMonth(month)}
        description="Manual tracking — no bank connections. Build the habit before the salary arrives."
        actions={
          <div className="flex items-center gap-0.5 rounded-[10px] border-2 border-border bg-card p-0.5 shadow-brutal-sm">
            <Button variant="ghost" size="icon" aria-label="Previous month" nativeButton={false} render={<Link href={`/finance?month=${addMonths(month, -1)}`} />}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/finance" />}>
              This month
            </Button>
            <Button variant="ghost" size="icon" aria-label="Next month" nativeButton={false} render={<Link href={`/finance?month=${addMonths(month, 1)}`} />}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MoneyTile label="Income" value={inr(income)} icon={TrendingUp} block="bg-block-lime" />
        <MoneyTile label="Expenses" value={inr(expense)} icon={TrendingDown} block="bg-block-pink" />
        <MoneyTile label="Saved" value={inr(saved)} hint={savingsRate != null ? `${savingsRate}% of income` : monthlyTarget ? `Target ${inr(monthlyTarget)}` : "Savings + investments"} icon={PiggyBank} block="bg-block-sky" />
        <MoneyTile label="Net" value={inr(income - expense - saved)} hint="Income − expenses − savings" icon={Wallet} block="bg-block-stone" negative={income - expense - saved < 0} />
      </div>

      <Panel title="Add transaction">
        <TransactionForm today={ctx.today} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Expenses by category">
          <Donut data={donut} unit=" ₹" ariaLabel="Expense breakdown by category" />
        </Panel>
        <Panel title="Last 6 months">
          <Bars
            data={six}
            keys={[
              { key: "income", label: "Income", color: BLOCK.lime },
              { key: "expense", label: "Expenses", color: BLOCK.pink },
              { key: "saved", label: "Saved", color: BLOCK.sky },
            ]}
            ariaLabel="Income, expenses and savings over six months"
            emptyText="No transactions yet"
          />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Transactions">
          <TransactionList items={monthTx.map((t) => ({ id: t.id, date: t.date, type: t.type, category: t.category, amount: Number(t.amount), note: t.note }))} />
        </Panel>
        <Panel title="Emergency fund" description={fundTarget ? `${inr(fundSaved)} of ${inr(fundTarget)}` : "Set a target to track progress"}>
          {fundTarget && (
            <div className="mb-5">
              <Bar value={fundSaved} max={fundTarget} color={fundSaved >= fundTarget ? BLOCK.lime : BLOCK.sky} label="Emergency fund progress" />
              <p className="mt-1.5 text-xs text-muted-foreground">
                <span className={cn(num, "text-foreground")}>{Math.min(100, Math.round((fundSaved / fundTarget) * 100))}%</span> · counts all “Saving” entries
              </p>
            </div>
          )}
          <FundTargetForm emergency={fundTarget} monthly={monthlyTarget} />
        </Panel>
      </div>
    </div>
  );
}
