import type { ChallengeDayType } from "@/lib/challenge/schedule"
import type { Listing } from "@/lib/types"

/** Listing statuses that count as completed (never drafts/ready/error). */
const COMPLETED_STATUSES = new Set(["listed", "sold", "delisted"])

function inWindow(iso: string, startMs: number, endMs: number) {
  const t = new Date(iso).getTime()
  return Number.isFinite(t) && t >= startMs && t < endMs
}

function isCompletedListing(listing: Listing) {
  if (listing.status === "draft" || listing.status === "ready" || listing.status === "error") {
    return false
  }
  if (COMPLETED_STATUSES.has(listing.status)) return true
  return (listing.marketplaceListings || []).some((ref) => ref.status === "listed")
}

/**
 * Count list / relist activity inside a challenge day window.
 * - list: completed listings whose updated_at falls in the window
 *   (new publishes and first-time lists). Drafts never count.
 * - relist: completed listings updated in the window that already existed
 *   before the day started (proxy for end-and-relist).
 * - rest: always 0 (auto-completes separately).
 */
export function countChallengeActivity(
  listings: Listing[],
  type: ChallengeDayType,
  dayStartMs: number,
  dayEndMs: number
): number {
  if (type === "rest") return 0

  const matches = listings.filter((listing) => {
    if (!isCompletedListing(listing)) return false
    if (!inWindow(listing.updatedAt, dayStartMs, dayEndMs)) return false

    const createdMs = new Date(listing.createdAt).getTime()
    const existedBeforeDay = Number.isFinite(createdMs) && createdMs < dayStartMs

    if (type === "relist") return existedBeforeDay
    // list days: prefer first-time / same-day completions; still count a
    // draft created earlier that was published today (created before day,
    // but not previously listed for long). Marketplace first publish today
    // is represented by updated_at in window + completed status.
    // Exclude clear relists of older live inventory when possible: if the
    // listing existed before the day AND already has marketplace history
    // older than the day, treat as relist-only and skip on list days.
    if (existedBeforeDay) {
      const olderMarketplace = (listing.marketplaceListings || []).some((ref) => {
        if (!ref.lastSyncedAt) return false
        const synced = new Date(ref.lastSyncedAt).getTime()
        return Number.isFinite(synced) && synced < dayStartMs && ref.status === "listed"
      })
      // If it still looks like a fresh publish of a prior draft (no older
      // marketplace sync), count it on list days.
      if (olderMarketplace) return false
    }
    return true
  })

  return matches.length
}
