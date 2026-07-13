import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-lg border border-[var(--lw-border)] bg-[var(--lw-surface)] px-3.5 py-2 text-sm text-[var(--lw-fg)] shadow-sm transition-colors placeholder:text-[var(--lw-fg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lw-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lw-bg)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
)
Input.displayName = "Input"

export { Input }
