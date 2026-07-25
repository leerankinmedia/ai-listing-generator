import Link from "next/link"
import { cn } from "@/lib/utils"

/**
 * Force internal logo/nav targets to same-origin relative paths.
 * Never navigate to absolute env / production hosts (breaks preview sessions).
 */
export function toRelativeAppHref(href: string, fallback = "/"): string {
  const raw = href?.trim() || fallback
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw
  try {
    const url = new URL(raw)
    const path = `${url.pathname}${url.search}${url.hash}` || fallback
    return path.startsWith("/") ? path : `/${path}`
  } catch {
    return raw.startsWith("/") ? raw : fallback
  }
}

export function Logo({
  className,
  href = "/",
  markOnly = false,
}: {
  className?: string
  href?: string
  markOnly?: boolean
}) {
  const relativeHref = toRelativeAppHref(href, "/")

  return (
    <Link
      href={relativeHref}
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
