import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-[8px] border-2 border-ink bg-card px-3 py-2 text-base text-foreground transition-[box-shadow,background-color] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary focus-visible:shadow-brutal-sm disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-block-danger md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
