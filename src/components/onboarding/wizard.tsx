"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DayPicker, Field, TimeInput } from "@/components/common/form";
import { useAction } from "@/components/common/use-action";
import { completeOnboarding, updateProfile, updateSettings } from "@/server/actions/settings";
import { proposeWeekPlan } from "@/server/actions/schedule";
import { ExamEditor, TargetRow, TimetableEditor, WorkEditor, type SlotView, type TargetView } from "@/components/config/editors";
import { ProposalDialog, type OpenProposal } from "@/components/tasks/proposal-dialog";
import { BrandLockup } from "@/components/shell/logo";
import { formatDuration } from "@/lib/time";
import { cn } from "@/lib/utils";

interface Props {
  today: string;
  profile: { displayName: string; location: string; education: string; college: string; graduationTarget: string; currentRole: string; company: string };
  settings: { wakeMinute: number; sleepMinute: number; dailyFocusLimitMin: number; dailyTaskLimit: number; gymDays: number[]; gymPreferredStart: number | null; gymDurationMin: number; aiDailyMin: number; aiWeeklyMin: number; aiMonthlyMin: number };
  slots: SlotView[];
  work: { id: string; dayOfWeek: number; startMinute: number; endMinute: number; label: string }[];
  targets: TargetView[];
  periods: { id: string; name: string; startDate: string; endDate: string; leadDays: number }[];
  exams: { id: string; title: string; date: string; startMinute: number | null }[];
}

const STEPS = [
  { title: "Confirm your details", hint: "Pre-filled from your initial context. Edit anything." },
  { title: "College timetable", hint: "Your lectures and practicals. TrackMe never schedules over them." },
  { title: "Internship / work schedule", hint: "Fixed work hours, if you have them." },
  { title: "Gym & fitness", hint: "Which days and when you prefer to train." },
  { title: "AI learning time", hint: "You choose what to learn — TrackMe protects the time." },
  { title: "MBA profile targets", hint: "Profile building through 2027 — no intensive CAT prep yet." },
  { title: "Creative writing & side project", hint: "Important, but secondary — flexible weekly time." },
  { title: "Sleep & availability", hint: "Sleep is protected. Nothing is ever scheduled outside these hours." },
  { title: "Upcoming examinations", hint: "Add papers as they are announced." },
  { title: "Your first week", hint: "Preview a schedule built from everything above." },
];

export function OnboardingWizard(props: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const { run, pending } = useAction();
  const [profile, setProfile] = useState(props.profile);
  const [s, setS] = useState(props.settings);
  const [proposal, setProposal] = useState<OpenProposal | null>(null);

  const next = () => setStep((x) => Math.min(STEPS.length - 1, x + 1));
  const back = () => setStep((x) => Math.max(0, x - 1));
  const saveAndNext = (fn: () => Promise<{ ok: true; data: undefined; message?: string } | { ok: false; error: string }>) => run(fn, { success: false, onSuccess: next });

  const finish = () =>
    run(() => completeOnboarding(), {
      success: "You're all set. Welcome to TrackMe.",
      onSuccess: () => {
        router.push("/");
        router.refresh();
      },
    });

  const byKey = (k: string) => props.targets.find((t) => t.key === k);

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col px-4 py-8 sm:py-12">
      <div className="mb-8 flex items-start gap-3">
        <BrandLockup />
        <button
          type="button"
          onClick={finish}
          className="ml-auto rounded-[6px] px-1.5 py-1 text-sm font-semibold text-muted-foreground underline decoration-2 underline-offset-4 outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          Skip setup
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Welcome to TrackMe</p>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono font-medium text-foreground tabular-nums">
            Step {step + 1} of {STEPS.length}
          </span>{" "}
          · every step is optional
        </p>
      </div>

      <div
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={step + 1}
        aria-valuetext={`Step ${step + 1} of ${STEPS.length}`}
        className="mb-7 flex gap-1.5"
      >
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-3.5 flex-1 rounded-[4px] border-2 border-ink transition-colors",
              i < step ? "bg-block-lime" : i === step ? "bg-block-sun" : "bg-card",
            )}
          />
        ))}
      </div>

      <section className="animate-rise flex-1 rounded-[10px] border-[3px] border-ink bg-card p-5 shadow-brutal-lg sm:p-7" key={step} aria-labelledby="step-title">
        <h1 id="step-title" className="font-display text-3xl leading-tight font-extrabold tracking-[-0.03em] sm:text-[34px]">
          {STEPS[step].title}
        </h1>
        <p className="mt-1.5 mb-6 text-[15px] text-muted-foreground">{STEPS[step].hint}</p>

        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["displayName", "Name"],
                ["location", "Location"],
                ["education", "Education"],
                ["college", "College"],
                ["graduationTarget", "Expected graduation (YYYY-MM)"],
                ["currentRole", "Current role"],
                ["company", "Company"],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} label={label} htmlFor={`p-${k}`}>
                <Input id={`p-${k}`} value={profile[k]} onChange={(e) => setProfile({ ...profile, [k]: e.target.value })} />
              </Field>
            ))}
          </div>
        )}
        {step === 1 && <TimetableEditor slots={props.slots} />}
        {step === 2 && <WorkEditor blocks={props.work} />}
        {step === 3 && (
          <div className="grid gap-5">
            <Field label="Gym days" hint={`${s.gymDays.length} day(s) per week — recommended 4–5.`}>
              <DayPicker value={s.gymDays} onChange={(v) => setS({ ...s, gymDays: v })} label="Gym days" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Preferred start (optional)" htmlFor="g-start">
                <TimeInput id="g-start" value={s.gymPreferredStart} onChange={(v) => setS({ ...s, gymPreferredStart: v })} />
              </Field>
              <Field label="Session length (min)" htmlFor="g-dur">
                <Input id="g-dur" type="number" min={15} step={5} value={s.gymDurationMin} onChange={(e) => setS({ ...s, gymDurationMin: Number(e.target.value) })} />
              </Field>
            </div>
            {byKey("cardio") && <TargetRow target={byKey("cardio")!} compact />}
          </div>
        )}
        {step === 4 && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Daily (minutes)" htmlFor="ai-d">
              <Input id="ai-d" type="number" min={0} step={5} value={s.aiDailyMin} onChange={(e) => setS({ ...s, aiDailyMin: Number(e.target.value) })} />
            </Field>
            <Field label="Weekly (hours)" htmlFor="ai-w" hint={formatDuration(s.aiWeeklyMin)}>
              <Input id="ai-w" type="number" min={0} step={0.5} value={s.aiWeeklyMin / 60} onChange={(e) => setS({ ...s, aiWeeklyMin: Math.round(Number(e.target.value) * 60) })} />
            </Field>
            <Field label="Monthly (hours)" htmlFor="ai-m" hint={formatDuration(s.aiMonthlyMin)}>
              <Input id="ai-m" type="number" min={0} step={1} value={s.aiMonthlyMin / 60} onChange={(e) => setS({ ...s, aiMonthlyMin: Math.round(Number(e.target.value) * 60) })} />
            </Field>
          </div>
        )}
        {step === 5 && (
          <div className="grid gap-3">
            {["mba-reading", "mba-awareness", "mba-communication", "mba-leadership", "career-achievement"].map((k) => byKey(k) && <TargetRow key={k} target={byKey(k)!} compact />)}
          </div>
        )}
        {step === 6 && <div className="grid gap-3">{["creative-writing", "side-project"].map((k) => byKey(k) && <TargetRow key={k} target={byKey(k)!} compact />)}</div>}
        {step === 7 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Wake-up time" htmlFor="wake">
              <TimeInput id="wake" value={s.wakeMinute} onChange={(v) => v != null && setS({ ...s, wakeMinute: v })} />
            </Field>
            <Field label="Bedtime" htmlFor="sleep" hint={`${formatDuration(24 * 60 - (s.sleepMinute - s.wakeMinute))} of protected sleep`}>
              <TimeInput id="sleep" value={s.sleepMinute} onChange={(v) => v != null && setS({ ...s, sleepMinute: v })} />
            </Field>
            <Field label="Max focus work per day (hours)" htmlFor="focus" hint="Excludes lectures and work hours.">
              <Input id="focus" type="number" min={0.5} step={0.5} value={s.dailyFocusLimitMin / 60} onChange={(e) => setS({ ...s, dailyFocusLimitMin: Math.round(Number(e.target.value) * 60) })} />
            </Field>
            <Field label="Max tasks per day" htmlFor="limit">
              <Input id="limit" type="number" min={1} max={30} value={s.dailyTaskLimit} onChange={(e) => setS({ ...s, dailyTaskLimit: Number(e.target.value) })} />
            </Field>
          </div>
        )}
        {step === 8 && <ExamEditor periods={props.periods} exams={props.exams} />}
        {step === 9 && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <span aria-hidden className="grid size-14 -rotate-3 place-items-center rounded-[10px] border-2 border-ink bg-block-violet text-[#111111] shadow-brutal">
              <Sparkles className="size-7" strokeWidth={2.25} />
            </span>
            <p className="max-w-md text-sm text-muted-foreground">
              TrackMe will plan the rest of this week from your targets, around your timetable and work, without touching sleep. You&apos;ll see every change before anything is saved.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button disabled={pending} onClick={() => run(() => proposeWeekPlan(props.today), { success: false, onSuccess: setProposal })}>
                <Sparkles className="size-4" /> Preview my week
              </Button>
              <Button variant="outline" onClick={finish} disabled={pending}>
                <Check className="size-4" /> Finish
              </Button>
            </div>
          </div>
        )}
      </section>

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={back} disabled={step === 0}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        {step < STEPS.length - 1 && (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={next}>
              Skip
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                if (step === 0) saveAndNext(() => updateProfile(profile));
                else if (step === 3) saveAndNext(() => updateSettings({ gymDays: s.gymDays, gymPreferredStart: s.gymPreferredStart, gymDurationMin: s.gymDurationMin }));
                else if (step === 4) saveAndNext(() => updateSettings({ aiDailyMin: s.aiDailyMin, aiWeeklyMin: s.aiWeeklyMin, aiMonthlyMin: s.aiMonthlyMin }));
                else if (step === 7) saveAndNext(() => updateSettings({ wakeMinute: s.wakeMinute, sleepMinute: s.sleepMinute, dailyFocusLimitMin: s.dailyFocusLimitMin, dailyTaskLimit: s.dailyTaskLimit }));
                else next();
              }}
            >
              Continue <ArrowRight className="size-4" />
            </Button>
          </div>
        )}
      </div>
      <ProposalDialog value={proposal} onClose={() => setProposal(null)} onApplied={finish} />
    </main>
  );
}
