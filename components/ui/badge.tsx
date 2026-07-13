import { cn } from "@/lib/utils"

export function Badge({
  className,
  tone = "neutral",
  children,
}: {
  className?: string
  tone?: "neutral" | "accent" | "success" | "warning" | "danger"
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide",
        tone === "neutral" && "bg-[var(--muted)] text-[var(--foreground)]",
        tone === "accent" && "bg-[var(--accent-soft)] text-[var(--accent-foreground-soft)]",
        tone === "success" && "bg-emerald-500/15 text-emerald-800",
        tone === "warning" && "bg-amber-500/15 text-amber-900",
        tone === "danger" && "bg-rose-500/15 text-rose-800",
        className,
      )}
    >
      {children}
    </span>
  )
}
