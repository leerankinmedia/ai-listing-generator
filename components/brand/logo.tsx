import Link from "next/link"
import { cn } from "@/lib/utils"

export function Logo({
  className,
  href = "/",
  markOnly = false,
}: {
  className?: string
  href?: string
  markOnly?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2.5 text-foreground transition-opacity hover:opacity-90",
        className
      )}
    >
      <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-[18px] w-[18px]"
          aria-hidden
        >
          <path
            d="M5 7.5h9.5a3.5 3.5 0 0 1 0 7H9"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M9 14.5h10"
            stroke="var(--accent)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="7" cy="18" r="1.4" fill="var(--accent)" />
        </svg>
      </span>
      {!markOnly && (
        <span className="font-display text-xl font-semibold tracking-tight">
          List<span className="text-accent">Wise</span>
        </span>
      )}
    </Link>
  )
}
