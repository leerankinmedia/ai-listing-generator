import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-[transform,background-color,box-shadow,color,opacity] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lw-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lw-bg)] disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--lw-accent)] text-[var(--lw-accent-fg)] shadow-sm hover:bg-[var(--lw-accent-hover)]",
        secondary:
          "bg-[var(--lw-surface-2)] text-[var(--lw-fg)] hover:bg-[var(--lw-surface-3)]",
        outline:
          "border border-[var(--lw-border)] bg-transparent text-[var(--lw-fg)] hover:bg-[var(--lw-surface-2)]",
        ghost: "text-[var(--lw-fg-muted)] hover:bg-[var(--lw-surface-2)] hover:text-[var(--lw-fg)]",
        danger:
          "bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 rounded-md px-3 text-xs",
        lg: "h-12 rounded-xl px-7 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  ),
)
Button.displayName = "Button"

export { Button, buttonVariants }
