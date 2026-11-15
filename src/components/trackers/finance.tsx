"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/common/form";
import { useAction } from "@/components/common/use-action";
import { addTransaction, deleteTransaction } from "@/server/actions/trackers";
import { updateSettings } from "@/server/actions/settings";
import { EXPENSE_CATEGORIES } from "@/lib/domain/constants";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";

import { inr } from "@/lib/format";
import { chip, divide, num, reveal, rowIconBtn } from "@/components/config/bold";

const TYPE_CHIP: Record<string, { label: string; className: string }> = {
  INCOME: { label: "In", className: "bg-block-lime" },
  EXPENSE: { label: "Out", className: "bg-block-pink" },
  SAVING: { label: "Save", className: "bg-block-sky" },
  INVESTMENT: { label: "Invest", className: "bg-block-violet" },
};

const CATS: Record<string, string[]> = {
  INCOME: ["Salary", "Stipend", "Freelance", "Gift", "Other"],
  EXPENSE: EXPENSE_CATEGORIES,
  SAVING: ["Emergency fund", "Savings account", "Other"],
  INVESTMENT: ["Mutual funds", "Stocks", "FD / RD", "PPF / NPS", "Other"],
};

export function TransactionForm({ today }: { today: string }) {
  const { run, pending } = useAction();
  const [v, setV] = useState({ date: today, type: "EXPENSE", category: "Food", amount: "", note: "" });
  return (
    <form
      className="grid gap-3 sm:grid-cols-6"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addTransaction({ ...v, amount: Number(v.amount), note: v.note || undefined }), { onSuccess: () => setV({ ...v, amount: "", note: "" }) });
      }}
    >
      <Field label="Type" htmlFor="tx-type">
        <NativeSelect id="tx-type" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value, category: CATS[e.target.value][0] })}>
          <option value="INCOME">Income</option>
          <option value="EXPENSE">Expense</option>
          <option value="SAVING">Saving</option>
          <option value="INVESTMENT">Investment</option>
        </NativeSelect>
      </Field>
      <Field label="Category" htmlFor="tx-cat">
        <NativeSelect id="tx-cat" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>
          {CATS[v.type].map((c) => <option key={c} value={c}>{c}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Amount (₹)" htmlFor="tx-amt">
        <Input id="tx-amt" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value.replace(/[^\d.]/g, "") })} placeholder="0" />
      </Field>
      <Field label="Date" htmlFor="tx-date">
        <Input id="tx-date" type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} className="dark:[color-scheme:dark]" />
      </Field>
      <Field label="Note" htmlFor="tx-note">
        <Input id="tx-note" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
      </Field>
      <Button type="submit" disabled={pending || !(Number(v.amount) > 0)} className="self-end">Add</Button>
    </form>
  );
}

export function TransactionList({ items }: { items: { id: string; date: string; type: string; category: string; amount: number; note: string | null }[] }) {
  const { run, pending } = useAction();
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No transactions this month.</p>;
  return (
    <ul className={divide}>
      {items.map((t) => (
        <li key={t.id} className="group flex items-center gap-3 py-2.5 text-sm">
          <span className={cn(num, "w-14 shrink-0 text-xs text-muted-foreground")}>{formatDate(t.date, "dm")}</span>
          <span className={cn(chip, TYPE_CHIP[t.type]?.className ?? "bg-block-stone", "w-14 justify-center")}>{TYPE_CHIP[t.type]?.label ?? t.type}</span>
          <span className="min-w-0 flex-1 truncate">
            <span className="font-semibold">{t.category}</span>
            {t.note && <span className="text-muted-foreground"> · {t.note}</span>}
          </span>
          <span className={cn(num, "shrink-0", t.type === "INCOME" && "text-success")}>
            {t.type === "EXPENSE" ? "−" : t.type === "INCOME" ? "+" : ""}
            {inr(t.amount)}
          </span>
          <button type="button" disabled={pending} onClick={() => run(() => deleteTransaction(t.id))} className={cn(rowIconBtn, reveal)} aria-label={`Delete ${t.category} transaction`}><Trash2 className="size-3.5" /></button>
        </li>
      ))}
    </ul>
  );
}

export function FundTargetForm({ emergency, monthly }: { emergency: number | null; monthly: number | null }) {
  const { run, pending } = useAction();
  const [e, setE] = useState(emergency?.toString() ?? "");
  const [m, setM] = useState(monthly?.toString() ?? "");
  return (
    <form
      className="grid grid-cols-2 gap-3"
      onSubmit={(ev) => {
        ev.preventDefault();
        run(() => updateSettings({ emergencyFundTarget: e ? Number(e) : null, monthlySavingsTarget: m ? Number(m) : null }));
      }}
    >
      <Field label="Emergency fund target (₹)" htmlFor="ef"><Input id="ef" inputMode="numeric" value={e} onChange={(x) => setE(x.target.value.replace(/[^\d]/g, ""))} placeholder="Not set" /></Field>
      <Field label="Monthly savings target (₹)" htmlFor="ms"><Input id="ms" inputMode="numeric" value={m} onChange={(x) => setM(x.target.value.replace(/[^\d]/g, ""))} placeholder="Not set" /></Field>
      <Button type="submit" variant="outline" disabled={pending} className="col-span-2 justify-self-start">Save targets</Button>
    </form>
  );
}
