import { cn } from "@/lib/utils"

export function Logo({
  className,
  markOnly = false,
}: {
  className?: string
  markOnly?: boolean
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--lw-accent)] text-[var(--lw-accent-fg)] shadow-[0_0_24px_-4px_rgba(15,200,160,0.7)]"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-4 w-4"
          aria-hidden
        >
          <path
            d="M5 7.5h10.5M5 12h14M5 16.5h8"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="18.5" cy="7.5" r="1.6" fill="currentColor" />
        </svg>
      </span>
      {!markOnly && (
        <span className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-[var(--lw-fg)]">
          List<span className="text-[var(--lw-accent)]">Wise</span>
        </span>
      )}
    </span>
  )
}
