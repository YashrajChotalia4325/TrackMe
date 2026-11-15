"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/validation";

/** Run a server action with pending state and toast feedback. */
export function useAction() {
  const [pending, startTransition] = useTransition();
  function run<T>(fn: () => Promise<ActionResult<T>>, opts: { onSuccess?: (data: T) => void; success?: string | false } = {}) {
    startTransition(async () => {
      try {
        const r = await fn();
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        const msg = opts.success === false ? undefined : (opts.success ?? r.message);
        if (msg) toast.success(msg);
        opts.onSuccess?.(r.data);
      } catch (e) {
        console.error(e);
        toast.error("Something went wrong. Please try again.");
      }
    });
  }
  return { pending, run };
}
