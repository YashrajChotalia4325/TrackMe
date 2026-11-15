import { z } from "zod";
import { isISODate } from "./time";

export const isoDate = z.string().refine(isISODate, "Use a valid date (YYYY-MM-DD)");
export const minuteOfDay = z.number().int().min(0).max(24 * 60);
export const optionalText = z
  .string()
  .trim()
  .max(5000)
  .optional()
  .transform((v) => (v ? v : undefined));

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const KINDS = ["FIXED", "HIGH_PRIORITY", "RECURRING", "FLEXIBLE", "OPTIONAL"] as const;
export const STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "SKIPPED", "RESCHEDULED", "MISSED"] as const;

export const taskInput = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    description: optionalText,
    categoryId: z.string().min(1, "Choose a category"),
    priority: z.enum(PRIORITIES),
    kind: z.enum(KINDS),
    date: isoDate,
    startMinute: minuteOfDay.nullable(),
    durationMin: z.number().int().min(5, "At least 5 minutes").max(12 * 60),
    deadline: isoDate.nullable().optional(),
    canSkip: z.boolean().default(false),
    weeklyTargetId: z.string().nullable().optional(),
    goalId: z.string().nullable().optional(),
    notes: optionalText,
    recurrence: z
      .object({ daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1), endDate: isoDate.nullable().optional() })
      .nullable()
      .optional(),
  })
  .refine((v) => v.startMinute == null || v.startMinute + v.durationMin <= 24 * 60, {
    message: "Task must end before midnight",
    path: ["durationMin"],
  });
export type TaskInput = z.infer<typeof taskInput>;

export type ActionResult<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string };

export function firstError(e: z.ZodError): string {
  return e.issues[0]?.message ?? "Invalid input";
}
