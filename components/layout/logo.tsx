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
    lg: "text-3xl md:text-4xl",
  }

  return (
    <Link
      href={href}
      className={cn(
        "font-[family-name:var(--font-display)] font-bold tracking-tight text-[var(--lw-fg)] transition-opacity hover:opacity-80",
        sizes[size],
        className,
      )}
    >
      List
      <span className="text-[var(--lw-accent)]">Wise</span>
    </Link>
  )
}
