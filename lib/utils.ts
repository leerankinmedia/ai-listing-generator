import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function clampTitleLength(title: string, min = 70, max = 80): string {
  const cleaned = title.replace(/\s+/g, " ").trim()
  if (cleaned.length <= max && cleaned.length >= min) return cleaned
  if (cleaned.length > max) {
    const truncated = cleaned.slice(0, max + 1)
    const lastSpace = truncated.lastIndexOf(" ")
    return (lastSpace > min ? truncated.slice(0, lastSpace) : cleaned.slice(0, max)).trim()
  }
  return cleaned
}
