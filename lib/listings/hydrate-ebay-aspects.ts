/**
 * Client-side: hydrate a listing with eBay Taxonomy aspects before the edit page.
 * Feels like an AI employee finished the paperwork first.
 */

import {
  applyExactAspectsToListing,
  autoFillHighConfidenceAspects,
  summarizeAiEmployeeAspects,
  validateAspectsAgainstOptions,
  type AiEmployeeAspectSummary,
  type EbayAspectFormField,
} from "@/lib/listings/ebay-aspect-fields"
import { enrichEbayTitleTowardLimit } from "@/lib/listings/ebay-title"
import type { Listing } from "@/lib/types"

export type HydrateEbayAspectsResult = {
  listing: Listing
  formFields: EbayAspectFormField[]
  summary: AiEmployeeAspectSummary
  ok: boolean
  skippedReason?: string
}

/**
 * Call aspects-preview, apply AI-employee confidence tiers, enrich title.
 * Safe to call when eBay is not connected (returns listing unchanged).
 */
export async function hydrateListingEbayAspects(
  listing: Listing
): Promise<HydrateEbayAspectsResult> {
  try {
    const res = await fetch("/api/marketplaces/ebay/aspects-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listing }),
    })

    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        code?: string
      }
      return {
        listing,
        formFields: [],
        summary: {
          completed: 0,
          total: 0,
          needsAttention: 0,
          autoFilled: 0,
          review: 0,
        },
        ok: false,
        skippedReason:
          json.code === "ebay_not_connected"
            ? "ebay_not_connected"
            : json.error || "aspects_preview_failed",
      }
    }

    const json = (await res.json()) as {
      formFields?: EbayAspectFormField[]
      resolvedFields?: Array<{ name: string; value: string }>
      suggestedTitle?: string
    }

    const formFields = json.formFields || []
    const optionsByName = new Map<string, string[]>()
    for (const field of formFields) {
      if (field.allowedValues?.length) {
        optionsByName.set(field.name.toLowerCase(), field.allowedValues)
      }
    }

    const fromResolved = json.resolvedFields || []
    const fromSuggested = formFields
      .filter((f) => f.suggestedValue || f.value)
      .map((f) => ({
        name: f.name,
        value: (f.value || f.suggestedValue || "").trim(),
      }))
      .filter((f) => f.value)

    let next = applyExactAspectsToListing(
      listing,
      [...fromResolved, ...fromSuggested],
      optionsByName
    )

    // Apply ≥95% auto / 70–94% preselect / <70% blank.
    next = autoFillHighConfidenceAspects(next, formFields)
    const validated = validateAspectsAgainstOptions(next, formFields)
    next = validated.listing

    const suggested =
      json.suggestedTitle || enrichEbayTitleTowardLimit(next.title, next)
    if (suggested && suggested !== next.title && suggested.length <= 80) {
      if (
        (suggested.length >= 70 && suggested.length <= 80) ||
        suggested.length > next.title.length
      ) {
        next = {
          ...next,
          title: suggested,
          updatedAt: new Date().toISOString(),
        }
      }
    }

    const summary = summarizeAiEmployeeAspects(formFields, next)
    return { listing: next, formFields, summary, ok: true }
  } catch {
    return {
      listing,
      formFields: [],
      summary: {
        completed: 0,
        total: 0,
        needsAttention: 0,
        autoFilled: 0,
        review: 0,
      },
      ok: false,
      skippedReason: "network_error",
    }
  }
}
