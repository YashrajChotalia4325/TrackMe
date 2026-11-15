import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-[8px] border-2 border-ink/10 bg-muted motion-reduce:animate-none", className)}
      {...props}
    />
  )
}

export { Skeleton }
