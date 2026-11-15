import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-[6px] border-2 border-ink px-2 py-0.5 text-xs leading-none font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-[color-mix(in_oklab,var(--primary),#111111_8%)]",
        secondary:
          "bg-muted text-foreground [a]:hover:bg-[color-mix(in_oklab,var(--muted),var(--foreground)_6%)]",
        destructive:
          "bg-block-danger text-[#111111] [a]:hover:bg-[color-mix(in_oklab,var(--block-danger),#111111_8%)]",
        outline:
          "bg-card text-foreground [a]:hover:bg-muted",
        ghost:
          "border-transparent text-foreground hover:bg-muted",
        link: "border-transparent text-foreground underline decoration-ink/30 decoration-2 underline-offset-4 hover:decoration-ink",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
