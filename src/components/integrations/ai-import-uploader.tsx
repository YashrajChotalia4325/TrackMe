"use client";

import { useId, useRef, useState } from "react";
import { AlertTriangle, FileJson, Loader2, ShieldCheck, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAction } from "@/components/common/use-action";
import { deleteAiUsage, importAiUsage } from "@/server/actions/ai-import";
import { AI_PROVIDER_META, aggregateByDay, chunkForUpload, detectFormat, explainUnrecognized, summarize, type AiDayAggregate, type AiImportSummary, type AiProvider } from "@/lib/domain/ai-export-parser";
import { formatDate } from "@/lib/time";
import type { ActionResult } from "@/lib/validation";

const LARGE_FILE_BYTES = 200 * 1024 * 1024;
const MAX_FILE_BYTES = 1536 * 1024 * 1024;
/**
 * Keep each server-action request well under Next's 1 MB body limit. Measured
 * in UTF-8 bytes, since titles may be Hindi, emoji, etc.
 */
const CHUNK_BYTES = 500_000;
const CHUNK_DAYS = 1000;

type State =
  | { phase: "idle" }
  | { phase: "reading"; fileName: string; warning: string | null }
  | { phase: "error"; fileName: string; error: string }
  | { phase: "ready"; fileName: string; warning: string | null; provider: AiProvider; days: AiDayAggregate[]; summary: AiImportSummary };

const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

export function AiImportButton({ provider, timeZone, hasData }: { provider: AiProvider; timeZone: string; hasData: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ phase: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  /** Bumped on reset so a read that finishes after the dialog closed is ignored. */
  const readToken = useRef(0);
  const inputId = useId();
  const statusId = useId();
  const { run, pending } = useAction();
  const label = AI_PROVIDER_META[provider].label;

  function reset() {
    readToken.current++;
    setState({ phase: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onFile(file: File | undefined) {
    if (!file) return reset();
    const fileName = file.name;
    if (/\.zip$/i.test(fileName)) {
      return setState({ phase: "error", fileName, error: "That's the zip archive. Unzip it first, then choose conversations.json from inside the folder." });
    }
    if (file.size > MAX_FILE_BYTES) {
      return setState({ phase: "error", fileName, error: `That file is ${mb(file.size)}, which is too large to read in the browser.` });
    }
    const warning = file.size > LARGE_FILE_BYTES ? `This is a large file (${mb(file.size)}). Reading it may take a minute and use a lot of memory.` : null;
    const token = ++readToken.current;
    const update = (next: State) => {
      if (readToken.current === token) setState(next);
    };
    setState({ phase: "reading", fileName, warning });
    // Let the "Reading…" state paint before the heavy synchronous parse.
    await new Promise((r) => setTimeout(r, 30));
    if (readToken.current !== token) return;

    const tooBig = `Your browser ran out of memory reading this ${mb(file.size)} file. Close other tabs and try again, or try a desktop browser.`;
    let text: string;
    try {
      text = await file.text();
    } catch {
      return update({ phase: "error", fileName, error: file.size > LARGE_FILE_BYTES ? tooBig : "Couldn't read that file. Choose it again." });
    }
    if (readToken.current !== token) return;

    let json: unknown;
    try {
      json = JSON.parse(text);
      text = ""; // release the raw file text (message bodies included) before aggregating
    } catch (e) {
      if (!(e instanceof SyntaxError)) return update({ phase: "error", fileName, error: tooBig });
      return update({
        phase: "error",
        fileName,
        error: /\.json$/i.test(fileName)
          ? "This file isn't valid JSON — it may be incomplete. Download the export again and choose conversations.json."
          : "This isn't a JSON file. Unzip the export and choose conversations.json.",
      });
    }

    try {
      const detected = detectFormat(json);
      if (!detected) return update({ phase: "error", fileName, error: explainUnrecognized(json) });
      const days = aggregateByDay(json, detected, timeZone);
      json = null;
      if (days.length === 0) return update({ phase: "error", fileName, error: "No messages you sent were found in this export, so there's nothing to import." });
      update({ phase: "ready", fileName, warning, provider: detected, days, summary: summarize(days) });
    } catch {
      update({ phase: "error", fileName, error: "Couldn't make sense of this file. Make sure it's conversations.json from an unzipped ChatGPT or Claude export." });
    }
  }

  function submit() {
    if (state.phase !== "ready") return;
    const { provider: target, days } = state;
    const total = days.length;
    run(
      async (): Promise<ActionResult<{ days: number }>> => {
        const parts = chunkForUpload(days, CHUNK_BYTES, CHUNK_DAYS);
        let saved = 0;
        for (const part of parts) {
          const r = await importAiUsage({ provider: target, days: part.days, range: part.range });
          if (!r.ok) {
            // Earlier chunks are already saved (each replaces only its own days), so say so.
            return saved > 0 ? { ok: false, error: `${r.error} ${saved.toLocaleString()} of ${total.toLocaleString()} days were saved — import the file again to finish.` } : r;
          }
          saved += part.days.length;
        }
        return { ok: true, data: { days: total }, message: `${AI_PROVIDER_META[target].label} usage imported (${total} ${total === 1 ? "day" : "days"})` };
      },
      {
        onSuccess: () => {
          setOpen(false);
          reset();
        },
      },
    );
  }

  const ready = state.phase === "ready" ? state : null;
  const recentTitles = ready ? [...new Set(ready.days.slice(-14).flatMap((d) => d.titles))].slice(-5).reverse() : [];

  return (
    <>
      <Button variant={hasData ? "outline" : "default"} size="sm" onClick={() => setOpen(true)}>
        <Upload className="size-3.5" aria-hidden /> {hasData ? "Re-import" : "Import"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (pending) return;
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import {label} usage</DialogTitle>
            <DialogDescription>Choose conversations.json from your unzipped {label} data export.</DialogDescription>
          </DialogHeader>

          <p className="flex gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            <span>
              The file is read on this device. Message text never leaves your browser — TrackMe only saves daily counts and conversation titles.
            </span>
          </p>

          <div className="grid gap-1.5">
            <label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">
              conversations.json
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept=".json,application/json"
              disabled={pending || state.phase === "reading"}
              aria-describedby={statusId}
              onChange={(e) => void onFile(e.target.files?.[0])}
              className="block w-full cursor-pointer rounded-lg border border-input bg-transparent text-sm text-muted-foreground outline-none file:mr-3 file:cursor-pointer file:border-0 file:border-r file:border-input file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium file:text-secondary-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
            />
            {hasData && <p className="text-xs text-muted-foreground">Re-importing replaces the days the new file covers — nothing is counted twice.</p>}
          </div>

          <div id={statusId} aria-live="polite" className="grid gap-3">
            {state.phase !== "idle" && "warning" in state && state.warning && (
              <p className="flex gap-2 text-xs text-warning">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {state.warning}
              </p>
            )}
            {state.phase === "reading" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Reading {state.fileName}…
              </p>
            )}
            {state.phase === "error" && (
              <p role="alert" className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{state.error}</span>
              </p>
            )}
            {ready && (
              <div className="rounded-xl border border-border p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <FileJson className="size-4 text-muted-foreground" aria-hidden />
                  {AI_PROVIDER_META[ready.provider].label} export · {formatDate(ready.summary.from!)} – {formatDate(ready.summary.to!)}
                </p>
                {ready.provider !== provider && (
                  <p className="mt-2 text-xs text-warning">
                    This is a {AI_PROVIDER_META[ready.provider].label} export, not {label}, so it will be saved as {AI_PROVIDER_META[ready.provider].label} usage.
                  </p>
                )}
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Active days", ready.summary.activeDays],
                    ["Messages sent", ready.summary.messages],
                    ["Chats (per day)", ready.summary.conversations],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-muted/50 px-2 py-2">
                      <dt className="text-[11px] text-muted-foreground">{k}</dt>
                      <dd className="tabular text-base font-semibold">{Number(v).toLocaleString()}</dd>
                    </div>
                  ))}
                </dl>
                {recentTitles.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground">Recent titles that will be saved:</p>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {recentTitles.map((t) => (
                        <li key={t} className="truncate">
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Cancel
            </Button>
            <Button disabled={!ready || pending} onClick={submit}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {ready ? `Import ${ready.summary.activeDays.toLocaleString()} ${ready.summary.activeDays === 1 ? "day" : "days"}` : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AiDeleteButton({ provider, days }: { provider: AiProvider; days: number }) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useAction();
  const label = AI_PROVIDER_META[provider].label;
  return (
    <>
      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => setOpen(true)}>
        <Trash2 className="size-3.5" aria-hidden /> Delete imported data
      </Button>
      <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete imported {label} data?</DialogTitle>
            <DialogDescription>
              {days > 0
                ? `This removes ${days.toLocaleString()} ${days === 1 ? "day" : "days"} of imported counts and titles from TrackMe.`
                : `No imported days are stored — this just clears the ${label} import record.`}{" "}
              Your {label} account isn&apos;t touched, and you can import again any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button variant="destructive" disabled={pending} onClick={() => run(() => deleteAiUsage(provider), { onSuccess: () => setOpen(false) })}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
