/**
 * Client-side eBay publish: validate, hydrate exact aspects, then POST /api/listings/publish.
 */

import { readApiJsonResponse } from "@/lib/api/read-json-response"
import { ensureDurableOriginalImageUrls } from "@/lib/listings/durable-images"
import {
  applyExactAspectsToListing,
  validateAspectsAgainstOptions,
} from "@/lib/listings/ebay-aspect-fields"
import { enrichEbayTitleTowardLimit } from "@/lib/listings/ebay-title"
import {
  collectEbayPublishBlockers,
  ensureListingQuantity,
  type EbayAspectMeta,
} from "@/lib/listings/review-draft"
import {
  applyPublishResultsToListing,
  publishResultsIncludeSuccess,
} from "@/lib/listings/publish-persist"
import { persistListing } from "@/lib/listings/repository"
import { saveLocalListing } from "@/lib/listings/local-db"
import { ensureListingInventorySku } from "@/lib/listings/sku"
import type { Listing, OneClickPublishResult } from "@/lib/types"

export class EbayPublishBlockedError extends Error {
  blockers: string[]
  constructor(blockers: string[]) {
    super(
      blockers.length === 1
        ? blockers[0]
        : `Complete required fields before listing: ${blockers.join(", ")}.`
    )
    this.name = "EbayPublishBlockedError"
    this.blockers = blockers
  }
}

async function hydrateExactEbayAspects(listing: Listing): Promise<{
  listing: Listing
  blockers: string[]
}> {
  try {
    const previewRes = await fetch("/api/marketplaces/ebay/aspects-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listing }),
      credentials: "same-origin",
    })
    if (!previewRes.ok) {
      const json = (await previewRes.json().catch(() => ({}))) as {
        error?: string
        code?: string
      }
      if (
        json.code === "ebay_not_connected" ||
        previewRes.status === 401 ||
        /unauthor/i.test(json.error || "")
      ) {
        return {
          listing,
          blockers: ["Connect eBay to load item specifics"],
        }
      }
      return {
        listing,
        blockers: [
          json.error?.trim() || "Could not load eBay item specifics",
        ],
      }
    }
    const preview = (await previewRes.json()) as {
      formFields?: Array<{
        name: string
        required: boolean
        allowedValues?: string[]
        value?: string
        suggestedValue?: string
      }>
      resolvedFields?: Array<{ name: string; value: string }>
      missingRequiredNames?: string[]
      suggestedTitle?: string
    }
    const optionsByName = new Map<string, string[]>()
    for (const field of preview.formFields || []) {
      if (field.allowedValues?.length) {
        optionsByName.set(field.name.toLowerCase(), field.allowedValues)
      }
    }
    const merged = [
      ...(preview.resolvedFields || []),
      ...((preview.formFields || [])
        .filter((f) => f.value || f.suggestedValue)
        .map((f) => ({
          name: f.name,
          value: (f.value || f.suggestedValue || "").trim(),
        }))
        .filter((f) => f.value) as Array<{ name: string; value: string }>),
    ]
    let next = applyExactAspectsToListing(listing, merged, optionsByName)
    const validated = validateAspectsAgainstOptions(
      next,
      preview.formFields || []
    )
    next = validated.listing
    if (
      preview.suggestedTitle &&
      preview.suggestedTitle.length >= 70 &&
      preview.suggestedTitle.length <= 80
    ) {
      next = { ...next, title: preview.suggestedTitle }
    }
    const missing =
      validated.missingRequired.length > 0
        ? validated.missingRequired
        : preview.missingRequiredNames || []
    return { listing: next, blockers: missing }
  } catch {
    return {
      listing,
      blockers: ["Could not load eBay item specifics"],
    }
  }
}

export async function publishListingToEbay(options: {
  listing: Listing
  userId: string
  aspectMeta?: EbayAspectMeta
  onListingChange?: (listing: Listing) => void
}): Promise<{ listing: Listing; results: OneClickPublishResult[] }> {
  if (!options.userId) {
    throw new Error("Sign in required to publish.")
  }
  const publishStarted = Date.now()

  let listingForChecks = ensureListingQuantity(options.listing)
  const localBlockers = collectEbayPublishBlockers(
    listingForChecks,
    options.aspectMeta
  )
  if (localBlockers.length > 0) {
    throw new EbayPublishBlockedError(localBlockers)
  }

  const hydrateStarted = Date.now()
  const hydrated = await hydrateExactEbayAspects(listingForChecks)
  listingForChecks = hydrated.listing
  options.onListingChange?.(listingForChecks)
  console.info("[timing]", {
    flow: "ebay_publish",
    stage: "client_aspects_preview",
    ms: Date.now() - hydrateStarted,
  })
  if (hydrated.blockers.length > 0) {
    throw new EbayPublishBlockedError(hydrated.blockers)
  }

  const prepared = ensureListingInventorySku({
    ...listingForChecks,
    title: enrichEbayTitleTowardLimit(
      listingForChecks.title,
      listingForChecks
    ),
  })

  const durableStarted = Date.now()
  const durableImages = await ensureDurableOriginalImageUrls(
    prepared.images,
    options.userId
  )
  console.info("[timing]", {
    flow: "ebay_publish",
    stage: "durable_original_urls",
    ms: Date.now() - durableStarted,
  })
  const listingForPublish: Listing = {
    ...prepared,
    images: durableImages,
    targetMarketplaces: ["ebay"],
    updatedAt: new Date().toISOString(),
  }
  options.onListingChange?.(listingForPublish)

  const apiStarted = Date.now()
  const response = await fetch("/api/listings/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      listing: listingForPublish,
      marketplaceIds: ["ebay"],
    }),
  })
  const parsed = await readApiJsonResponse<{
    error?: string
    results?: OneClickPublishResult[]
    listing?: Listing
  }>(response)
  console.info("[timing]", {
    flow: "ebay_publish",
    stage: "publish_api",
    ms: Date.now() - apiStarted,
  })
  if (!parsed.ok) {
    throw new Error(parsed.error || "Publish failed")
  }

  const results = (parsed.data.results || []) as OneClickPublishResult[]
  let nextListing = listingForPublish
  if (publishResultsIncludeSuccess(results)) {
    nextListing =
      parsed.data.listing && typeof parsed.data.listing === "object"
        ? (parsed.data.listing as Listing)
        : applyPublishResultsToListing(
            listingForPublish,
            results,
            options.userId
          )
    try {
      if (parsed.data.listing && typeof parsed.data.listing === "object") {
        // Server already upserted; keep this device in sync without a second write.
        await saveLocalListing(nextListing)
      } else {
        const saved = await persistListing(nextListing)
        if (saved) nextListing = saved
      }
    } catch (persistError) {
      console.error("[publish] client persist after publish failed", persistError)
    }
  }

  const ebayError = results.find((row) => row.marketplaceId === "ebay" && !row.ok)
  if (ebayError) {
    const extra =
      ebayError.requiredFields?.map((f) => f.name).filter(Boolean) ?? []
    if (extra.length > 0) {
      throw new EbayPublishBlockedError(extra)
    }
    throw new Error(ebayError.message || "eBay publish failed.")
  }

  console.info("[timing]", {
    flow: "ebay_publish",
    stage: "client_total",
    ms: Date.now() - publishStarted,
  })
  return { listing: nextListing, results }
}
