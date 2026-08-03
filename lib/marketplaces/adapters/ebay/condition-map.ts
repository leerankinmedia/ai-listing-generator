/**
 * Map ListWise / AI condition labels onto eBay Metadata condition policies
 * for an exact category. Never invents condition IDs — only picks from the
 * policy response for that categoryId.
 */
import type { EbayInventoryCondition } from "@/lib/marketplaces/adapters/ebay/inventory-sanitize"

/** Standard eBay conditionId → Inventory API ConditionEnum (global ID map, not category). */
export const EBAY_CONDITION_ID_TO_ENUM: Record<string, EbayInventoryCondition> = {
  "1000": "NEW",
  "1500": "NEW_OTHER",
  "1750": "NEW_WITH_DEFECTS",
  "2000": "MANUFACTURER_REFURBISHED",
  "2010": "CERTIFIED_REFURBISHED",
  "2020": "EXCELLENT_REFURBISHED",
  "2030": "VERY_GOOD_REFURBISHED",
  "2040": "GOOD_REFURBISHED",
  "2500": "SELLER_REFURBISHED",
  "2750": "LIKE_NEW",
  "3000": "USED_EXCELLENT",
  "4000": "USED_VERY_GOOD",
  "5000": "USED_GOOD",
  "6000": "USED_ACCEPTABLE",
  "7000": "FOR_PARTS_OR_NOT_WORKING",
}

export type EbayPolicyCondition = {
  conditionId: string
  conditionDescription: string
  conditionHelpText?: string
}

export type MappedEbayCondition = {
  conditionId: string
  conditionName: string
  conditionEnum: EbayInventoryCondition
  matchedFrom: string
  score: number
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Alias groups for AI / ListWise condition wording → preference order within used/new. */
const AI_CONDITION_ALIASES: Array<{ keys: string[]; prefer: RegExp[] }> = [
  {
    keys: ["new with tags", "new with box", "brand new", "new"],
    prefer: [/new with tags/, /^new$/, /new with box/, /brand new/],
  },
  {
    keys: ["new without tags", "new other", "new open box", "open box"],
    prefer: [/new without tags/, /new \(other\)/, /open box/, /new other/],
  },
  {
    keys: [
      "pre-owned",
      "preowned",
      "pre owned",
      "used",
      "excellent",
      "good",
      "fair",
      "poor",
      "like new",
    ],
    prefer: [
      /pre[-\s]?owned/,
      /^used$/,
      /used[-\s]?excellent/,
      /like[-\s]?new/,
      /used[-\s]?very[-\s]?good/,
      /used[-\s]?good/,
      /used[-\s]?acceptable/,
    ],
  },
  {
    keys: ["for parts", "not working", "parts only"],
    prefer: [/for[-\s]?parts/, /not[-\s]?working/],
  },
]

function scorePolicyAgainstAi(
  policy: EbayPolicyCondition,
  aiNormalized: string
): number {
  const desc = normalize(policy.conditionDescription)
  const help = normalize(policy.conditionHelpText || "")
  let score = 0

  if (!aiNormalized) return 0
  if (desc === aiNormalized) score += 100
  if (desc.includes(aiNormalized) || aiNormalized.includes(desc)) score += 40

  for (const group of AI_CONDITION_ALIASES) {
    const aiInGroup = group.keys.some(
      (k) => aiNormalized === k || aiNormalized.includes(k) || k.includes(aiNormalized)
    )
    if (!aiInGroup) continue
    score += 20
    for (let i = 0; i < group.prefer.length; i++) {
      if (group.prefer[i].test(desc) || group.prefer[i].test(help)) {
        score += 50 - i * 5
        break
      }
    }
  }

  // Soft preference: ListWise "Excellent/Good/Fair/Poor" → used-family policies
  if (
    /^(excellent|good|fair|poor)$/.test(aiNormalized) &&
    /(pre[-\s]?owned|^used$|used )/i.test(desc)
  ) {
    score += 25
  }

  return score
}

export function conditionEnumForId(
  conditionId: string
): EbayInventoryCondition | null {
  return EBAY_CONDITION_ID_TO_ENUM[conditionId.trim()] || null
}

/**
 * Pick the best condition from the category's Metadata policy list for an AI label.
 * Returns null when the policy list is empty (caller must not invent an ID).
 */
export function mapAiConditionToPolicy(
  aiCondition: string | undefined | null,
  policies: EbayPolicyCondition[]
): MappedEbayCondition | null {
  if (!policies.length) return null

  const ai = (aiCondition || "").trim()
  const aiNorm = normalize(ai)

  let best: { policy: EbayPolicyCondition; score: number } | null = null
  for (const policy of policies) {
    const score = scorePolicyAgainstAi(policy, aiNorm)
    if (!best || score > best.score) {
      best = { policy, score }
    }
  }

  // If AI gave nothing useful, prefer Pre-owned / Used when available, else first policy.
  if (!best || best.score <= 0) {
    const preOwned =
      policies.find((p) =>
        /pre[-\s]?owned|^used$/i.test(normalize(p.conditionDescription))
      ) ||
      policies.find((p) => /used/i.test(p.conditionDescription)) ||
      policies[0]
    best = { policy: preOwned, score: 1 }
  }

  const enumValue =
    conditionEnumForId(best.policy.conditionId) || "USED_EXCELLENT"

  return {
    conditionId: best.policy.conditionId,
    conditionName: best.policy.conditionDescription,
    conditionEnum: enumValue,
    matchedFrom: ai || "(default)",
    score: best.score,
  }
}

/** True when conditionId is present in the policy list for this category. */
export function conditionIdAllowedForCategory(
  conditionId: string | undefined | null,
  policies: EbayPolicyCondition[]
): boolean {
  const id = (conditionId || "").trim()
  if (!id) return false
  return policies.some((p) => p.conditionId === id)
}

export function inventoryConditionAllowedForCategory(
  conditionEnum: string | undefined | null,
  policies: EbayPolicyCondition[]
): boolean {
  const raw = (conditionEnum || "").trim().toUpperCase()
  if (!raw) return false
  return policies.some((p) => conditionEnumForId(p.conditionId) === raw)
}
