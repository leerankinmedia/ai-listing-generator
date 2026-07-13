import Link from "next/link"
import { cn } from "@/lib/utils"

export function Logo({
  className,
  href = "/",
  size = "md",
}: {
  className?: string
  href?: string
  size?: "sm" | "md" | "lg"
}) {
  const sizes = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-3xl md:text-5xl",
  }

  return (
    <Link
      href={href}
      className={cn(
        "font-display inline-flex items-center gap-2 font-bold tracking-tight text-foreground",
        sizes[size],
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "relative inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground",
          size === "lg" ? "h-10 w-10 md:h-12 md:w-12" : size === "sm" ? "h-7 w-7" : "h-8 w-8"
        )}
      >
        <svg viewBox="0 0 24 24" className="h-[55%] w-[55%]" fill="none">
          <path
            d="M4 7h10l6 5-6 5H4V7z"
            fill="currentColor"
            opacity="0.9"
          />
          <path
            d="M8 10h6M8 14h4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            className="text-primary-foreground"
            style={{ opacity: 0.55 }}
          />
        </svg>
      </span>
      <span>
        List<span className="text-primary">Wise</span>
      </span>
    </Link>
  )
}
