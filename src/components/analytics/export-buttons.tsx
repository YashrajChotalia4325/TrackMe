"use client";

import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/common/use-action";
import { exportData } from "@/server/actions/settings";

export function ExportButtons() {
  const { run, pending } = useAction();
  return (
    <>
      <Button variant="outline" onClick={() => window.print()} className="print:hidden">
        <Printer className="size-4" aria-hidden /> Print / PDF
      </Button>
      <Button
        variant="outline"
        disabled={pending}
        className="print:hidden"
        onClick={() =>
          run(() => exportData(), {
            success: "Export ready",
            onSuccess: (json) => {
              const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
              const a = document.createElement("a");
              a.href = url;
              a.download = `trackme-export-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            },
          })
        }
      >
        <Download className="size-4" aria-hidden /> Export data
      </Button>
    </>
  );
}
