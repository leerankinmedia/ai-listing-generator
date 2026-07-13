import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(
  amount: number,
  currency = "USD",
  locale = "en-US"
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** Prefer titles in the 70–80 character eBay SEO sweet spot. */
export function optimizeTitleLength(title: string): string {
  const cleaned = title.replace(/\s+/g, " ").trim()
  if (cleaned.length >= 70 && cleaned.length <= 80) return cleaned

  if (cleaned.length > 80) {
    const truncated = cleaned.slice(0, 80)
    const lastSpace = truncated.lastIndexOf(" ")
    if (lastSpace >= 70) return truncated.slice(0, lastSpace).trim()
    return truncated.trim()
  }

  return cleaned
}

export function isOptimalTitleLength(title: string) {
  const len = title.trim().length
  return len >= 70 && len <= 80
}

export function confidenceTone(score: number): "high" | "medium" | "low" {
  if (score >= 80) return "high"
  if (score >= 55) return "medium"
  return "low"
}
