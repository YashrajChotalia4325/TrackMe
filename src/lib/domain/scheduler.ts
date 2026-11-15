/**
 * TrackMe scheduling engine — deterministic, side-effect free.
 *
 * The engine never writes to the database. It receives a snapshot of the
 * user's days (fixed commitments + already-placed tasks) and returns a
 * *proposal* (list of changes + warnings). Server actions persist a proposal
 * only after the user approves it, inside a transaction, with an audit trail.
 *
 * Invariants enforced here:
 * - FIXED tasks are never moved automatically.
 * - Nothing is ever placed outside the wake → sleep window (sleep is protected).
 * - A minimum rest gap is kept between consecutive blocks.
 * - Each day has a focus-minute cap and a task-count cap (no overfilled days).
 * - Missed work is spread over the rest of the week, not dumped on tomorrow.
 * - OPTIONAL tasks that don't fit are skipped without creating backlog.
 * - Nothing is silently deleted: unplaceable tasks are reported as warnings.
 * - AVOID energy windows are hard: matching movable work is never auto-placed
 *   inside them (FIXED recurring commitments keep the user's chosen time).
 * - PREFER energy windows win over other free time when they have room.
 * - Rest days only receive essential work (fixed, high-priority, critical,
 *   or due within 2 days).
 */
import { KIND_RANK, PRIORITY_RANK, type CategoryKeyT, type ModeT } from "./constants";
import { addDays, diffDays, dayOfWeek, formatDate, formatDuration, formatMinute, type ISODate } from "../time";

export type Kind = keyof typeof KIND_RANK;
export type PriorityT = keyof typeof PRIORITY_RANK;

export interface Block {
  start: number;
  end: number;
  label?: string;
}

/**
 * An energy window on a specific day. PREFER = put matching work here when
 * possible; AVOID = never auto-schedule matching work here (hard constraint).
 * `categoryKey: null` applies to every category.
 */
export interface EnergyWindowBlock {
  categoryKey: CategoryKeyT | null;
  kind: "PREFER" | "AVOID";
  start: number;
  end: number;
  label?: string;
}

export interface DayContext {
  date: ISODate;
  wake: number;
  sleep: number;
  /** Fixed commitments: lectures, work, blocking events, FIXED tasks. */
  busy: Block[];
  /** Movable tasks that stay where they are (occupy time + count toward caps). */
  placed: Block[];
  /** Focus minutes already used by movable tasks that stay (incl. completed). */
  focusUsed: number;
  tasksCount: number;
  focusLimit: number;
  taskLimit: number;
  /** Earliest minute we may schedule (used for "today"). */
  notBefore?: number;
  /** Avoid starting work at/after this minute when possible (learned from history). */
  softLatestStart?: number;
  /** Rest day (from the day's template): only essential work may be auto-placed. */
  restDay?: boolean;
  /** Energy windows that apply to this day. */
  windows?: EnergyWindowBlock[];
}

export interface SchedTask {
  id: string;
  title: string;
  kind: Kind;
  priority: PriorityT;
  categoryKey: CategoryKeyT;
  date: ISODate;
  startMinute: number | null;
  durationMin: number;
  deadline: ISODate | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED" | "RESCHEDULED" | "MISSED";
  weeklyTargetKey?: string | null;
  canSkip?: boolean;
}

export type ChangeKind = "MOVE" | "SKIP" | "UNSCHEDULE" | "CREATE";

export interface ProposedChange {
  action: ChangeKind;
  taskId?: string;
  title: string;
  categoryKey: CategoryKeyT;
  from: { date: ISODate; start: number | null } | null;
  to: { date: ISODate; start: number | null } | null;
  durationMin: number;
  reason: string;
  // For CREATE
  create?: NewTaskSpec;
}

export interface NewTaskSpec {
  title: string;
  categoryKey: CategoryKeyT;
  kind: Kind;
  priority: PriorityT;
  date: ISODate;
  startMinute: number;
  durationMin: number;
  weeklyTargetKey?: string;
  recurringTaskId?: string;
  dedupeKey: string;
  canSkip: boolean;
  description?: string;
}

export interface Proposal {
  changes: ProposedChange[];
  warnings: string[];
  suggestions: string[];
  summary: string;
}

export const SLOT_STEP = 15;

const roundUp = (n: number, step = SLOT_STEP) => Math.ceil(n / step) * step;

/** Merge + sort blocks. */
export function mergeBlocks(blocks: Block[]): Block[] {
  const sorted = [...blocks].filter((b) => b.end > b.start).sort((a, b) => a.start - b.start);
  const out: Block[] = [];
  for (const b of sorted) {
    const last = out[out.length - 1];
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
    else out.push({ ...b });
  }
  return out;
}

export function overlaps(a: Block, b: Block): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Free windows in a day, honouring wake/sleep, notBefore, and a rest gap around blocks. */
export function freeSlots(ctx: DayContext, gap: number): Block[] {
  const startBound = Math.max(ctx.wake, ctx.notBefore != null ? roundUp(ctx.notBefore) : ctx.wake);
  const endBound = ctx.sleep;
  if (endBound <= startBound) return [];
  const occupied = mergeBlocks(
    [...ctx.busy, ...ctx.placed].map((b) => ({ start: b.start - gap, end: b.end + gap })),
  );
  const out: Block[] = [];
  let cursor = startBound;
  for (const b of occupied) {
    if (b.end <= cursor) continue;
    if (b.start >= endBound) break;
    if (b.start > cursor) out.push({ start: cursor, end: Math.min(b.start, endBound) });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < endBound) out.push({ start: cursor, end: endBound });
  return out.filter((s) => s.end - s.start >= SLOT_STEP);
}

/** Does an energy window apply to work of `categoryKey`? (null window = all categories) */
export function windowMatches(w: EnergyWindowBlock, categoryKey: CategoryKeyT | null | undefined): boolean {
  return w.categoryKey == null || (categoryKey != null && w.categoryKey === categoryKey);
}

export function remainingCapacity(ctx: DayContext): number {
  return Math.max(0, ctx.focusLimit - ctx.focusUsed);
}

/**
 * Find a start minute for `duration` in the day. Prefers the start closest to
 * `preferred`, otherwise the earliest. Respects caps unless `ignoreCaps`.
 *
 * Energy windows (when `ctx.windows` is set): a candidate overlapping a
 * matching AVOID window is never returned; if any candidate fits entirely
 * inside a matching PREFER window, only those candidates are considered.
 * Windows with a null category match every task, with or without `categoryKey`.
 */
export function findSlot(
  ctx: DayContext,
  duration: number,
  opts: { preferred?: number | null; gap: number; ignoreCaps?: boolean; categoryKey?: CategoryKeyT | null },
): number | null {
  if (!opts.ignoreCaps) {
    if (ctx.focusUsed + duration > ctx.focusLimit) return null;
    if (ctx.tasksCount + 1 > ctx.taskLimit) return null;
  }
  const slots = freeSlots(ctx, opts.gap);
  const matching = (ctx.windows ?? []).filter((w) => w.end > w.start && windowMatches(w, opts.categoryKey));
  const avoid = matching.filter((w) => w.kind === "AVOID");
  const prefer = matching.filter((w) => w.kind === "PREFER");
  let candidates: number[] = [];
  for (const s of slots) {
    for (let t = roundUp(s.start); t + duration <= s.end; t += SLOT_STEP) {
      const block = { start: t, end: t + duration };
      if (avoid.some((w) => overlaps(w, block))) continue;
      candidates.push(t);
    }
  }
  if (candidates.length === 0) return null;
  if (prefer.length > 0) {
    const inside = candidates.filter((t) => prefer.some((w) => t >= w.start && t + duration <= w.end));
    if (inside.length > 0) candidates = inside;
  }

  const soft = ctx.softLatestStart;
  const score = (t: number) => {
    let cost = opts.preferred != null ? Math.abs(t - opts.preferred) : t - ctx.wake;
    if (soft != null && t >= soft) cost += 600; // strongly discourage historically-failed hours
    return cost;
  };
  return candidates.reduce((best, t) => (score(t) < score(best) ? t : best), candidates[0]);
}

function occupy(ctx: DayContext, start: number, duration: number) {
  ctx.placed.push({ start, end: start + duration });
  ctx.focusUsed += duration;
  ctx.tasksCount += 1;
}

/** Higher = more urgent. */
export function urgency(t: Pick<SchedTask, "kind" | "priority" | "deadline">, today: ISODate): number {
  let u = PRIORITY_RANK[t.priority] * 10 + KIND_RANK[t.kind] * 6;
  if (t.deadline) {
    const days = diffDays(t.deadline, today);
    if (days <= 0) u += 40;
    else if (days <= 2) u += 25;
    else if (days <= 7) u += 10;
  }
  return u;
}

const cloneCtx = (c: DayContext): DayContext => ({ ...c, busy: [...c.busy], placed: [...c.placed] });

/**
 * Essential work: high-priority kind, critical priority, or due within 2 days.
 * Only essentials are re-placed in Recovery mode and may land on rest days.
 */
export function isEssential(t: Pick<SchedTask, "kind" | "priority" | "deadline">, today: ISODate): boolean {
  return t.kind === "HIGH_PRIORITY" || t.priority === "CRITICAL" || (t.deadline != null && diffDays(t.deadline, today) <= 2);
}

/**
 * Place a task on the best later day. Picks the day with the most remaining
 * capacity (ties → earliest) instead of always "tomorrow", and keeps the time
 * close to the original start.
 */
function placeOnLaterDay(
  task: SchedTask,
  days: DayContext[],
  gap: number,
  latestDate: ISODate | null,
  allowRestDays = true,
): { date: ISODate; start: number } | null {
  const eligible = days.filter((d) => (!latestDate || d.date <= latestDate) && (allowRestDays || !d.restDay));
  const ranked = [...eligible].sort((a, b) => {
    // Rest days usually have the most free capacity; even essential work only
    // lands on them when no regular day has room.
    if (!!a.restDay !== !!b.restDay) return a.restDay ? 1 : -1;
    const ca = remainingCapacity(a);
    const cb = remainingCapacity(b);
    if (cb !== ca) return cb - ca;
    return a.date < b.date ? -1 : 1;
  });
  for (const d of ranked) {
    const start = findSlot(d, task.durationMin, { preferred: task.startMinute, gap, categoryKey: task.categoryKey });
    if (start != null) {
      occupy(d, start, task.durationMin);
      return { date: d.date, start };
    }
  }
  return null;
}

export interface RescheduleDayInput {
  today: ISODate;
  nowMinute: number;
  /** Tasks currently scheduled for today (all statuses). */
  todayTasks: SchedTask[];
  /** Context for today; `placed` must NOT include today's movable incomplete tasks. */
  todayCtx: DayContext;
  /** Contexts for the following days the engine may use (e.g. rest of week). */
  laterDays: DayContext[];
  /** Last date the work may move to for weekly-target tasks (end of week). */
  weekEnd: ISODate;
  gap: number;
  mode: ModeT;
}

const INCOMPLETE = new Set(["PENDING", "MISSED", "IN_PROGRESS"]);

/**
 * "Reschedule My Day": re-pack incomplete movable work into the rest of today,
 * spread overflow across the week, and skip optional work that no longer fits.
 */
export function rescheduleDay(input: RescheduleDayInput): Proposal {
  const { today, nowMinute, gap, mode } = input;
  const todayCtx = cloneCtx(input.todayCtx);
  todayCtx.notBefore = Math.max(nowMinute, todayCtx.notBefore ?? 0);
  const later = input.laterDays.map(cloneCtx);

  const changes: ProposedChange[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  const incomplete = input.todayTasks.filter((t) => INCOMPLETE.has(t.status));
  const fixedMissed = incomplete.filter(
    (t) => t.kind === "FIXED" && t.startMinute != null && t.startMinute + t.durationMin <= nowMinute,
  );
  for (const t of fixedMissed) {
    warnings.push(`"${t.title}" is a fixed commitment that has passed — it was not moved. Update it manually if needed.`);
  }

  // Tasks in progress stay put; we only move work that hasn't started.
  const movable = incomplete
    .filter((t) => t.kind !== "FIXED" && t.status !== "IN_PROGRESS")
    .sort((a, b) => urgency(b, today) - urgency(a, today));

  for (const t of movable) {
    const from = { date: t.date, start: t.startMinute };
    // In recovery mode, only essentials (high priority / deadline-bound) are re-placed.
    const essential = isEssential(t, today);

    if (mode === "RECOVERY" && !essential) {
      changes.push({
        action: "SKIP",
        taskId: t.id,
        title: t.title,
        categoryKey: t.categoryKey,
        from,
        to: null,
        durationMin: t.durationMin,
        reason: "Recovery mode — paused without penalty.",
      });
      continue;
    }

    // On a rest day, non-essential work from earlier days is not pulled into today.
    const todayAllowed = essential || !todayCtx.restDay || t.date === todayCtx.date;
    const slotOpts = { preferred: Math.max(t.startMinute ?? 0, todayCtx.notBefore ?? 0), gap, categoryKey: t.categoryKey };
    // A task that still fits where it is (not missed, no clash, not in an AVOID
    // window) stays put: PREFER windows steer new placements, they don't uproot
    // work that already fits.
    const keep =
      todayAllowed && t.date === today && t.startMinute != null && t.startMinute >= (todayCtx.notBefore ?? 0)
        ? findSlot({ ...todayCtx, windows: todayCtx.windows?.filter((w) => w.kind === "AVOID") }, t.durationMin, slotOpts) === t.startMinute
        : false;
    const start = keep ? t.startMinute : todayAllowed ? findSlot(todayCtx, t.durationMin, slotOpts) : null;
    if (start != null) {
      occupy(todayCtx, start, t.durationMin);
      if (start !== t.startMinute) {
        changes.push({
          action: "MOVE",
          taskId: t.id,
          title: t.title,
          categoryKey: t.categoryKey,
          from,
          to: { date: today, start },
          durationMin: t.durationMin,
          reason: t.startMinute != null && t.startMinute < nowMinute ? "Missed earlier — fits later today." : "Re-packed around your remaining time.",
        });
      }
      continue;
    }

    if (t.kind === "OPTIONAL" || t.canSkip) {
      changes.push({
        action: "SKIP",
        taskId: t.id,
        title: t.title,
        categoryKey: t.categoryKey,
        from,
        to: null,
        durationMin: t.durationMin,
        reason: "Optional — skipped without creating a backlog.",
      });
      continue;
    }

    const latest = t.deadline && t.deadline < input.weekEnd ? t.deadline : input.weekEnd;
    const placed = placeOnLaterDay(t, later, gap, latest, essential);
    if (placed) {
      changes.push({
        action: "MOVE",
        taskId: t.id,
        title: t.title,
        categoryKey: t.categoryKey,
        from,
        to: placed,
        durationMin: t.durationMin,
        reason: `No room left today — moved to ${formatDate(placed.date, "weekday")}, the day with the most free time.`,
      });
      continue;
    }

    changes.push({
      action: "UNSCHEDULE",
      taskId: t.id,
      title: t.title,
      categoryKey: t.categoryKey,
      from,
      to: { date: today, start: null },
      durationMin: t.durationMin,
      reason: "No realistic slot before its deadline — kept as unscheduled backlog for your decision.",
    });
    warnings.push(
      `"${t.title}" (${formatDuration(t.durationMin)}) doesn't fit anywhere this week without overfilling a day or cutting sleep.`,
    );
  }

  const moved = changes.filter((c) => c.action === "MOVE").length;
  const skipped = changes.filter((c) => c.action === "SKIP").length;
  if (changes.length === 0) suggestions.push("Your day already fits. Nothing needs to move.");
  if (remainingCapacity(todayCtx) >= 45 && mode !== "RECOVERY") {
    suggestions.push(`You still have about ${formatDuration(remainingCapacity(todayCtx))} of focus capacity left today.`);
  }

  return {
    changes,
    warnings,
    suggestions,
    summary: `${moved} moved, ${skipped} skipped, ${changes.length - moved - skipped} need attention.`,
  };
}

/**
 * Conflict resolution when a new blocking commitment is added on `date`.
 * Fixed tasks that clash are reported (never moved); movable ones are
 * relocated the same day if possible, otherwise later in the week.
 */
export function resolveConflicts(input: {
  date: ISODate;
  newBlock: Block;
  tasksOnDate: SchedTask[];
  dayCtx: DayContext; // must include newBlock in busy, and NOT include the clashing tasks in placed
  laterDays: DayContext[];
  weekEnd: ISODate;
  gap: number;
}): Proposal {
  const ctx = cloneCtx(input.dayCtx);
  const later = input.laterDays.map(cloneCtx);
  const changes: ProposedChange[] = [];
  const warnings: string[] = [];
  const clashing = input.tasksOnDate.filter(
    (t) =>
      INCOMPLETE.has(t.status) &&
      t.startMinute != null &&
      overlaps({ start: t.startMinute, end: t.startMinute + t.durationMin }, input.newBlock),
  );

  for (const t of clashing.sort((a, b) => urgency(b, input.date) - urgency(a, input.date))) {
    const from = { date: t.date, start: t.startMinute };
    if (t.kind === "FIXED") {
      warnings.push(`Conflicts with fixed commitment "${t.title}" at ${formatMinute(t.startMinute)} — needs your approval to change.`);
      continue;
    }
    const start = findSlot(ctx, t.durationMin, { preferred: input.newBlock.end, gap: input.gap, categoryKey: t.categoryKey });
    if (start != null) {
      occupy(ctx, start, t.durationMin);
      changes.push({ action: "MOVE", taskId: t.id, title: t.title, categoryKey: t.categoryKey, from, to: { date: t.date, start }, durationMin: t.durationMin, reason: "Moved around the new commitment." });
      continue;
    }
    if (t.kind === "OPTIONAL" || t.canSkip) {
      changes.push({ action: "SKIP", taskId: t.id, title: t.title, categoryKey: t.categoryKey, from, to: null, durationMin: t.durationMin, reason: "Optional — skipped to make room." });
      continue;
    }
    const placed = placeOnLaterDay(
      t,
      later,
      input.gap,
      t.deadline && t.deadline < input.weekEnd ? t.deadline : input.weekEnd,
      isEssential(t, input.date),
    );
    if (placed) {
      changes.push({ action: "MOVE", taskId: t.id, title: t.title, categoryKey: t.categoryKey, from, to: placed, durationMin: t.durationMin, reason: `Moved to ${formatDate(placed.date, "weekday")}.` });
    } else {
      changes.push({ action: "UNSCHEDULE", taskId: t.id, title: t.title, categoryKey: t.categoryKey, from, to: { date: t.date, start: null }, durationMin: t.durationMin, reason: "No free slot this week — left unscheduled for you to decide." });
      warnings.push(`"${t.title}" could not be re-placed this week.`);
    }
  }

  return {
    changes,
    warnings,
    suggestions: [],
    summary: clashing.length === 0 ? "No conflicts." : `${clashing.length} conflicting task(s) found.`,
  };
}

// ───────────────────────────── Weekly planning ─────────────────────────────

export interface PlanTarget {
  key: string;
  label: string;
  categoryKey: CategoryKeyT;
  unit: "MINUTES" | "SESSIONS";
  target: number; // for the active mode
  /** Already done + already scheduled in the week (minutes or sessions). */
  covered: number;
  blockMin: number;
  preferredStart: number | null;
  autoPlan: boolean;
  optional: boolean;
  /** Restrict to these days of week (e.g. gym days). */
  daysOfWeek?: number[];
}

export interface PlanRecurring {
  id: string;
  title: string;
  categoryKey: CategoryKeyT;
  kind: Kind;
  priority: PriorityT;
  durationMin: number;
  daysOfWeek: number[];
  preferredStart: number | null;
  startDate: ISODate;
  endDate: ISODate | null;
  modes: ModeT[];
  canSkip: boolean;
  weeklyTargetKey?: string | null;
}

export interface PlanWeekInput {
  weekStart: ISODate;
  mode: ModeT;
  days: DayContext[]; // 7 contexts, Monday → Sunday
  targets: PlanTarget[];
  recurring: PlanRecurring[];
  existingDedupeKeys: Set<string>;
  /** Pending tasks from before this week that should be carried over. */
  carryover: SchedTask[];
  gap: number;
  /** Days that are inside an exam period (no new non-academic optional work). */
  examDates?: Set<ISODate>;
}

const TARGET_ORDER: Record<ModeT, CategoryKeyT[]> = {
  NORMAL: ["ACADEMICS", "CAREER", "FITNESS", "AI", "MBA", "CREATIVITY", "PERSONAL", "FINANCE"],
  EXAM: ["ACADEMICS", "FITNESS", "AI", "CAREER", "MBA", "PERSONAL", "CREATIVITY", "FINANCE"],
  RECOVERY: ["FITNESS", "PERSONAL", "ACADEMICS", "CAREER", "AI", "MBA", "CREATIVITY", "FINANCE"],
};

/** Generate a proposed schedule for a week. */
export function planWeek(input: PlanWeekInput): Proposal {
  const days = input.days.map(cloneCtx);
  const changes: ProposedChange[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];
  const weekEnd = addDays(input.weekStart, 6);
  const restKept = new Set<ISODate>();

  // 1) Recurring commitments.
  for (const r of input.recurring) {
    if (!r.modes.includes(input.mode)) continue;
    for (const d of days) {
      if (!r.daysOfWeek.includes(dayOfWeek(d.date))) continue;
      if (d.date < r.startDate || (r.endDate && d.date > r.endDate)) continue;
      const dedupeKey = `rec:${r.id}:${d.date}`;
      if (input.existingDedupeKeys.has(dedupeKey)) continue;
      // Rest days keep only fixed and high-priority commitments.
      if (d.restDay && r.kind !== "FIXED" && r.kind !== "HIGH_PRIORITY") {
        restKept.add(d.date);
        continue;
      }
      // FIXED commitments keep the time the user chose: energy windows only steer movable work.
      const slotCtx = r.kind === "FIXED" ? { ...d, windows: undefined } : d;
      const start = findSlot(slotCtx, r.durationMin, { preferred: r.preferredStart, gap: input.gap, ignoreCaps: r.kind === "FIXED", categoryKey: r.categoryKey });
      if (start == null) {
        warnings.push(`No room for "${r.title}" on ${formatDate(d.date, "weekday")}.`);
        continue;
      }
      occupy(d, start, r.durationMin);
      const spec: NewTaskSpec = {
        title: r.title,
        categoryKey: r.categoryKey,
        kind: r.kind,
        priority: r.priority,
        date: d.date,
        startMinute: start,
        durationMin: r.durationMin,
        recurringTaskId: r.id,
        weeklyTargetKey: r.weeklyTargetKey ?? undefined,
        dedupeKey,
        canSkip: r.canSkip,
      };
      changes.push(createChange(spec, "Recurring commitment."));
      if (r.weeklyTargetKey) {
        const tgt = input.targets.find((t) => t.key === r.weeklyTargetKey);
        if (tgt) tgt.covered += tgt.unit === "MINUTES" ? r.durationMin : 1;
      }
    }
  }

  // 2) Carry-over: spread pending work across the week (never all on Monday).
  const carry = [...input.carryover].sort((a, b) => urgency(b, input.weekStart) - urgency(a, input.weekStart));
  for (const t of carry) {
    if (t.kind === "OPTIONAL") continue; // optional work never becomes backlog
    const placed = placeOnLaterDay(t, days, input.gap, t.deadline && t.deadline < weekEnd ? t.deadline : weekEnd, isEssential(t, input.weekStart));
    if (placed) {
      changes.push({ action: "MOVE", taskId: t.id, title: t.title, categoryKey: t.categoryKey, from: { date: t.date, start: t.startMinute }, to: placed, durationMin: t.durationMin, reason: "Carried over from last week." });
    } else {
      warnings.push(`Carry-over "${t.title}" doesn't fit this week — left in your backlog.`);
    }
  }

  // 3) Weekly targets, ordered by the mode's priorities.
  const order = TARGET_ORDER[input.mode];
  const targets = [...input.targets]
    .filter((t) => t.autoPlan && t.target > 0)
    .sort((a, b) => order.indexOf(a.categoryKey) - order.indexOf(b.categoryKey));

  for (const tgt of targets) {
    const tgtKind: Kind = tgt.optional ? "OPTIONAL" : tgt.categoryKey === "ACADEMICS" ? "HIGH_PRIORITY" : "RECURRING";
    const tgtPriority: PriorityT = tgt.categoryKey === "ACADEMICS" && input.mode === "EXAM" ? "HIGH" : "MEDIUM";
    const tgtEssential = isEssential({ kind: tgtKind, priority: tgtPriority, deadline: null }, input.weekStart);
    let remaining = tgt.target - tgt.covered;
    if (remaining <= 0) continue;
    // Minute targets are split into even blocks near the preferred length (no tiny leftovers).
    let blocks = tgt.unit === "MINUTES" ? Math.max(1, Math.round(remaining / tgt.blockMin)) : remaining;
    const blockMin = tgt.unit === "MINUTES" ? Math.ceil(remaining / blocks / SLOT_STEP) * SLOT_STEP : tgt.blockMin;
    const perDayMax = tgt.categoryKey === "ACADEMICS" && input.mode === "EXAM" ? 3 : 1;
    const usedPerDay = new Map<ISODate, number>();
    let placedCount = 0;

    // Candidate days: restricted list first (e.g. gym days), then others if needed.
    const preferredDays = tgt.daysOfWeek?.length ? days.filter((d) => tgt.daysOfWeek!.includes(dayOfWeek(d.date))) : days;
    const fallbackDays = tgt.daysOfWeek?.length ? days.filter((d) => !tgt.daysOfWeek!.includes(dayOfWeek(d.date))) : [];

    for (const pool of [preferredDays, fallbackDays]) {
      let progress = true;
      while (blocks > 0 && progress) {
        progress = false;
        const ranked = [...pool]
          .filter((d) => (usedPerDay.get(d.date) ?? 0) < perDayMax)
          .filter((d) => !(input.examDates?.has(d.date) && tgt.optional && tgt.categoryKey !== "FITNESS"))
          .filter((d) => {
            if (!d.restDay || tgtEssential) return true;
            restKept.add(d.date);
            return false;
          })
          .sort((a, b) => {
            // Even essential work goes to rest days only after other days.
            if (!!a.restDay !== !!b.restDay) return a.restDay ? 1 : -1;
            const ua = usedPerDay.get(a.date) ?? 0;
            const ub = usedPerDay.get(b.date) ?? 0;
            if (ua !== ub) return ua - ub;
            const diff = remainingCapacity(b) - remainingCapacity(a);
            return diff !== 0 ? diff : a.date < b.date ? -1 : 1;
          });
        for (const d of ranked) {
          if (blocks <= 0) break;
          const dur = tgt.unit === "MINUTES" ? Math.min(blockMin, Math.max(remaining, 15)) : blockMin;
          const preferred = tgt.preferredStart ?? defaultPreferredStart(tgt.categoryKey, dayOfWeek(d.date));
          const start = findSlot(d, dur, { preferred, gap: input.gap, categoryKey: tgt.categoryKey });
          if (start == null) continue;
          occupy(d, start, dur);
          usedPerDay.set(d.date, (usedPerDay.get(d.date) ?? 0) + 1);
          const n = placedCount + 1;
          changes.push(
            createChange(
              {
                title: tgt.label.replace(/ \(prorated.*\)$/, ""),
                categoryKey: tgt.categoryKey,
                kind: tgtKind,
                priority: tgtPriority,
                date: d.date,
                startMinute: start,
                durationMin: dur,
                weeklyTargetKey: tgt.key,
                dedupeKey: `tgt:${tgt.key}:${input.weekStart}:${n}`,
                canSkip: tgt.optional,
              },
              `Toward weekly target: ${tgt.label}.`,
            ),
          );
          placedCount = n;
          blocks -= 1;
          remaining -= tgt.unit === "MINUTES" ? dur : 1;
          progress = true;
        }
      }
    }

    if (remaining > 0) {
      const short = tgt.unit === "MINUTES" ? formatDuration(remaining) : `${remaining} session(s)`;
      warnings.push(`${tgt.label}: ${short} short of the weekly target — there isn't enough realistic free time.`);
    }
  }

  const created = changes.filter((c) => c.action === "CREATE").length;
  const moved = changes.filter((c) => c.action === "MOVE").length;
  const busiest = [...days].sort((a, b) => b.focusUsed - a.focusUsed)[0];
  if (busiest && busiest.focusUsed > 0) {
    suggestions.push(`Busiest day: ${formatDate(busiest.date, "weekday")} with ${formatDuration(busiest.focusUsed)} of planned focus work.`);
  }
  if (restKept.size > 0) {
    const names = [...restKept].sort().map((d) => formatDate(d, "weekday"));
    suggestions.push(`Kept ${names.join(", ")} light: rest day${names.length === 1 ? "" : "s"} only get essentials.`);
  }

  return {
    changes,
    warnings,
    suggestions,
    summary: `${created} session(s) planned, ${moved} carried over.`,
  };
}

function createChange(spec: NewTaskSpec, reason: string): ProposedChange {
  return {
    action: "CREATE",
    title: spec.title,
    categoryKey: spec.categoryKey,
    from: null,
    to: { date: spec.date, start: spec.startMinute },
    durationMin: spec.durationMin,
    reason,
    create: spec,
  };
}

/** Sensible default start times by category (weekday vs weekend). Editable per target. */
export function defaultPreferredStart(cat: CategoryKeyT, dow: number): number {
  const weekend = dow === 0 || dow === 6;
  switch (cat) {
    case "FITNESS":
      return weekend ? 8 * 60 : 7 * 60;
    case "ACADEMICS":
      return weekend ? 10 * 60 : 17 * 60;
    case "AI":
      return weekend ? 11 * 60 : 18 * 60 + 30;
    case "MBA":
      return weekend ? 16 * 60 : 20 * 60;
    case "CREATIVITY":
      return weekend ? 11 * 60 : 20 * 60 + 30;
    case "PERSONAL":
      return weekend ? 15 * 60 : 19 * 60 + 30;
    case "CAREER":
      return weekend ? 12 * 60 : 19 * 60;
    default:
      return 18 * 60;
  }
}

// ───────────────────────────── Learning from history ─────────────────────────────

export interface HistoryPoint {
  startMinute: number;
  completed: boolean;
}

/**
 * If tasks starting at/after 21:00 are completed far less often than earlier
 * ones (with enough samples), return a soft latest start + a suggestion.
 */
export function learnLateHourPattern(history: HistoryPoint[]): { softLatestStart?: number; suggestion?: string } {
  const late = history.filter((h) => h.startMinute >= 21 * 60);
  const early = history.filter((h) => h.startMinute < 21 * 60);
  if (late.length < 5 || early.length < 5) return {};
  const lateRate = late.filter((h) => h.completed).length / late.length;
  const earlyRate = early.filter((h) => h.completed).length / early.length;
  if (lateRate < 0.5 && earlyRate - lateRate >= 0.2) {
    return {
      softLatestStart: 21 * 60,
      suggestion: `You complete ${Math.round(lateRate * 100)}% of tasks scheduled after 9 PM vs ${Math.round(earlyRate * 100)}% earlier. New sessions will be placed earlier where possible.`,
    };
  }
  return {};
}

/** Should exam mode be suggested? Returns the period when within lead days. */
export function examModeSuggestion(
  today: ISODate,
  periods: { name: string; startDate: ISODate; endDate: ISODate; leadDays: number }[],
): { name: string; startDate: ISODate; endDate: ISODate; daysUntil: number } | null {
  for (const p of [...periods].sort((a, b) => (a.startDate < b.startDate ? -1 : 1))) {
    if (today > p.endDate) continue;
    const daysUntil = diffDays(p.startDate, today);
    if (daysUntil <= p.leadDays) return { name: p.name, startDate: p.startDate, endDate: p.endDate, daysUntil: Math.max(0, daysUntil) };
  }
  return null;
}
