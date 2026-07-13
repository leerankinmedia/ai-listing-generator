import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lw-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lw-bg)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--lw-accent)] text-[var(--lw-accent-fg)] shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_8px_24px_-8px_rgba(15,200,160,0.55)] hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0",
        secondary:
          "bg-[var(--lw-surface-elevated)] text-[var(--lw-fg)] border border-[var(--lw-border)] hover:bg-[var(--lw-surface-hover)] hover:border-[var(--lw-border-strong)]",
        ghost:
          "text-[var(--lw-fg-muted)] hover:text-[var(--lw-fg)] hover:bg-[var(--lw-surface-hover)]",
        outline:
          "border border-[var(--lw-border-strong)] bg-transparent text-[var(--lw-fg)] hover:bg-[var(--lw-surface-hover)]",
        link: "text-[var(--lw-accent)] underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-3.5 text-xs",
        lg: "h-12 px-7 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export type ButtonVariantProps = VariantProps<typeof buttonVariants>

export function buttonClassName(
  variants?: ButtonVariantProps,
  className?: string
) {
  return cn(buttonVariants(variants), className)
}
