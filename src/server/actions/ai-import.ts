"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { getContext } from "../context";
import { setIntegrationState } from "../integrations/tokens";
import { firstError, isoDate, type ActionResult } from "@/lib/validation";
import { AI_PROVIDERS, AI_PROVIDER_META, MAX_IMPORT_DAYS, MAX_TITLE_LENGTH, MAX_TITLES_PER_DAY } from "@/lib/domain/ai-export-parser";
import { diffDays } from "@/lib/time";

const count = z.number().int().min(0).max(1_000_000);

const dayInput = z.object({
  date: isoDate,
  conversations: count,
  messages: count,
  titles: z.array(z.string().max(MAX_TITLE_LENGTH)).max(MAX_TITLES_PER_DAY),
});

const importInput = z
  .object({
    provider: z.enum(AI_PROVIDERS),
    days: z.array(dayInput).max(MAX_IMPORT_DAYS, "That export covers too many days to import at once."),
    /**
     * Optional explicit replace window. The uploader sends large imports in
     * chunks; contiguous windows make each chunk replace exactly its span.
     * Defaults to [first day, last day].
     */
    range: z.object({ from: isoDate, to: isoDate }).optional(),
  })
  .superRefine((v, c) => {
    const seen = new Set<string>();
    for (const d of v.days) {
      if (seen.has(d.date)) {
        c.addIssue({ code: "custom", message: "Each day can only appear once." });
        return;
      }
      seen.add(d.date);
    }
    if (v.range) {
      if (v.range.from > v.range.to) c.addIssue({ code: "custom", message: "Invalid import range." });
      else if (diffDays(v.range.to, v.range.from) > 366 * 30) c.addIssue({ code: "custom", message: "Import range is too long." });
      if (v.days.some((d) => d.date < v.range!.from || d.date > v.range!.to)) c.addIssue({ code: "custom", message: "A day falls outside the import range." });
    } else if (v.days.length === 0) {
      c.addIssue({ code: "custom", message: "Nothing to import — no messages were found in that file." });
    }
  });

/** Error name/code only — Prisma messages can echo the submitted titles. */
function errorTag(e: unknown): string {
  if (!(e instanceof Error)) return "unknown error";
  const code = (e as { code?: unknown }).code;
  return typeof code === "string" ? `${e.name} ${code}` : e.name;
}

function revalidate() {
  revalidatePath("/ai");
  revalidatePath("/integrations");
}

/**
 * Save per-day ChatGPT/Claude usage aggregates parsed in the browser.
 * Re-importing replaces the provider's rows inside the imported date window.
 */
export async function importAiUsage(raw: unknown): Promise<ActionResult<{ days: number }>> {
  const ctx = await getContext();
  try {
    const p = importInput.safeParse(raw);
    if (!p.success) return { ok: false, error: firstError(p.error) };
    const { provider, days } = p.data;
    const dates = days.map((d) => d.date).sort();
    const from = p.data.range?.from ?? dates[0];
    const to = p.data.range?.to ?? dates[dates.length - 1];

    await db.$transaction([
      db.aiChatActivity.deleteMany({ where: { userId: ctx.userId, provider, date: { gte: from, lte: to } } }),
      db.aiChatActivity.createMany({
        data: days.map((d) => ({
          userId: ctx.userId,
          provider,
          date: d.date,
          conversations: d.conversations,
          messages: d.messages,
          // NUL and other control characters: PostgreSQL text rejects \u0000.
          titles: [...new Set(d.titles.map((t) => t.replace(/[\u0000-\u001f\u007f]/g, " ").trim()).filter(Boolean))],
        })),
      }),
    ]);
    await setIntegrationState(ctx.userId, provider, { lastSyncedAt: new Date(), lastError: null });
    revalidate();
    const label = AI_PROVIDER_META[provider].label;
    return { ok: true, data: { days: days.length }, message: `${label} usage imported (${days.length} ${days.length === 1 ? "day" : "days"})` };
  } catch (e) {
    console.error("importAiUsage failed", errorTag(e));
    return { ok: false, error: "Couldn't save the import. Please try again." };
  }
}

/** Remove every imported day for a provider, plus its integration record. */
export async function deleteAiUsage(provider: unknown): Promise<ActionResult> {
  const ctx = await getContext();
  try {
    const p = z.enum(AI_PROVIDERS).safeParse(provider);
    if (!p.success) return { ok: false, error: "Unknown provider" };
    await db.$transaction([
      db.aiChatActivity.deleteMany({ where: { userId: ctx.userId, provider: p.data } }),
      db.integration.deleteMany({ where: { userId: ctx.userId, provider: p.data } }),
    ]);
    revalidate();
    return { ok: true, data: undefined, message: `Imported ${AI_PROVIDER_META[p.data].label} data deleted` };
  } catch (e) {
    console.error("deleteAiUsage failed", errorTag(e));
    return { ok: false, error: "Couldn't delete the imported data. Please try again." };
  }
}
