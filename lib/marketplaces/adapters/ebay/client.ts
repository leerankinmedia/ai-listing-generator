import type { Listing } from "@/lib/types"
import { ebayApiBase } from "@/lib/marketplaces/adapters/ebay/oauth"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"

function requirePolicyEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new MarketplaceError(
      `${name} is required to publish to eBay (Business Policies).`,
      "ebay_policy_missing",
      400
    )
  }
  return value
}

export function mapListingToEbayInventory(listing: Listing) {
  const sku =
    listing.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50) || `lw-${Date.now()}`

  const aspects: Record<string, string[]> = {}
  if (listing.specifics.brand) aspects.Brand = [listing.specifics.brand]
  if (listing.specifics.size) aspects.Size = [listing.specifics.size]
  if (listing.specifics.color) aspects.Color = [listing.specifics.color]
  if (listing.specifics.material) aspects.Material = [listing.specifics.material]
  if (listing.specifics.style) aspects.Style = [listing.specifics.style]
  if (listing.specifics.pattern) aspects.Pattern = [listing.specifics.pattern]
  if (listing.specifics.gender) {
    aspects.Department = [listing.specifics.gender]
  }

  return {
    sku,
    inventoryItem: {
      availability: {
        shipToLocationAvailability: {
          quantity: 1,
        },
      },
      condition: mapCondition(listing.specifics.condition),
      conditionDescription: listing.specifics.flaws || undefined,
      product: {
        title: listing.title.slice(0, 80),
        description: listing.description,
        aspects,
        // Populated by adapter after EPS / Media API upload
        imageUrls: [] as string[],
      },
    },
  }
}

export function attachEbayImageUrls(
  inventoryItem: ReturnType<typeof mapListingToEbayInventory>["inventoryItem"],
  imageUrls: string[]
) {
  if (imageUrls.length === 0) {
    throw new MarketplaceError(
      "At least one listing photo is required to publish on eBay.",
      "ebay_images_required",
      400
    )
  }
  inventoryItem.product.imageUrls = imageUrls.slice(0, 24)
  return inventoryItem
}

function mapCondition(condition?: string) {
  switch (condition) {
    case "New with tags":
      return "NEW"
    case "New without tags":
      return "NEW_OTHER"
    case "Excellent":
      return "LIKE_NEW"
    case "Good":
      return "USED_EXCELLENT"
    case "Fair":
      return "USED_GOOD"
    case "Poor":
      return "USED_ACCEPTABLE"
    default:
      return "USED_EXCELLENT"
  }
}

export function mapListingToEbayOffer(
  listing: Listing,
  sku: string,
  merchantLocationKey: string
) {
  const categoryId = process.env.EBAY_DEFAULT_CATEGORY_ID || "15724"
  const marketplaceId = process.env.EBAY_MARKETPLACE_ID || "EBAY_US"
  if (!merchantLocationKey) {
    throw new MarketplaceError(
      "merchantLocationKey is required to publish to eBay.",
      "ebay_location_missing",
      400
    )
  }

  return {
    sku,
    marketplaceId,
    format: "FIXED_PRICE",
    availableQuantity: 1,
    categoryId,
    listingDescription: listing.description,
    listingPolicies: {
      fulfillmentPolicyId: requirePolicyEnv("EBAY_FULFILLMENT_POLICY_ID"),
      paymentPolicyId: requirePolicyEnv("EBAY_PAYMENT_POLICY_ID"),
      returnPolicyId: requirePolicyEnv("EBAY_RETURN_POLICY_ID"),
    },
    merchantLocationKey,
    pricingSummary: {
      price: {
        currency: listing.currency || "USD",
        value: listing.price.toFixed(2),
      },
    },
  }
}

type EbayErrorDetail = {
  errorId?: number
  domain?: string
  category?: string
  message?: string
  longMessage?: string
}

function isGenericEbayMessage(message?: string) {
  if (!message) return true
  const normalized = message.trim().toLowerCase()
  return (
    normalized === "system error" ||
    normalized === "error" ||
    normalized === "internal error" ||
    normalized === "unknown error"
  )
}

/** Strip secrets / tokens from text before logging or returning to the UI. */
function sanitizeEbayText(value: string | undefined, maxLen = 400): string | undefined {
  if (!value) return undefined
  const redacted = value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(
      /(access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization)\s*[:=]\s*["']?[^"'&\s]+/gi,
      "$1=[REDACTED]"
    )
    // Avoid dumping street-level address fragments if eBay embeds them in messages.
    .replace(
      /\b\d{1,6}\s+[A-Za-z0-9.'#-]+(?:\s+[A-Za-z0-9.'#-]+){0,5}\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Lane|Ln|Way|Dr|Drive)\b/gi,
      "[ADDRESS REDACTED]"
    )
  return redacted.length > maxLen ? `${redacted.slice(0, maxLen)}…` : redacted
}

function extractEbayErrorDetails(json: unknown): EbayErrorDetail[] {
  if (!json || typeof json !== "object") return []
  const payload = json as {
    errors?: Array<Record<string, unknown>>
    message?: string
    longMessage?: string
    errorId?: number
    domain?: string
    category?: string
  }

  const fromArray = Array.isArray(payload.errors)
    ? payload.errors.map((err) => ({
        errorId: typeof err.errorId === "number" ? err.errorId : undefined,
        domain: typeof err.domain === "string" ? err.domain : undefined,
        category: typeof err.category === "string" ? err.category : undefined,
        message: typeof err.message === "string" ? err.message : undefined,
        longMessage:
          typeof err.longMessage === "string" ? err.longMessage : undefined,
      }))
    : []

  if (fromArray.length > 0) return fromArray

  if (payload.message || payload.longMessage || payload.errorId) {
    return [
      {
        errorId: payload.errorId,
        domain: payload.domain,
        category: payload.category,
        message: payload.message,
        longMessage: payload.longMessage,
      },
    ]
  }

  return []
}

function formatEbayUserMessage(errors: EbayErrorDetail[], status: number) {
  const first = errors[0]
  if (!first) return `eBay API error (${status})`

  const shortMsg = sanitizeEbayText(first.message, 240)
  const longMsg = sanitizeEbayText(first.longMessage, 400)
  const preferred =
    (!isGenericEbayMessage(shortMsg) && shortMsg) ||
    longMsg ||
    shortMsg ||
    `eBay API error (${status})`

  const meta: string[] = []
  if (typeof first.errorId === "number") meta.push(`errorId=${first.errorId}`)
  if (first.domain) meta.push(`domain=${first.domain}`)
  if (first.category) meta.push(`category=${first.category}`)

  // When eBay only returns the useless "System error", surface longMessage + ids.
  if (isGenericEbayMessage(shortMsg) && longMsg && longMsg !== preferred) {
    return meta.length > 0 ? `${longMsg} (${meta.join(", ")})` : longMsg
  }

  return meta.length > 0 ? `${preferred} (${meta.join(", ")})` : preferred
}

/**
 * TEMP: safe Inventory API response logging (no tokens, secrets, or full addresses).
 * Logs HTTP status plus eBay error fields on every Inventory call used during publish.
 */
function logEbayInventoryResponse(opts: {
  method: string
  path: string
  status: number
  ok: boolean
  errors: EbayErrorDetail[]
}) {
  console.info("[ebay/inventory] TEMP response", {
    method: opts.method,
    path: opts.path.split("?")[0], // drop query values; keep resource path only
    status: opts.status,
    ok: opts.ok,
    errors: opts.errors.map((err) => ({
      errorId: err.errorId,
      domain: err.domain,
      category: err.category,
      message: sanitizeEbayText(err.message),
      longMessage: sanitizeEbayText(err.longMessage),
    })),
  })
}

export async function ebayFetch(
  path: string,
  accessToken: string,
  init?: RequestInit & { contentLanguage?: string }
) {
  const headers = new Headers(init?.headers)
  headers.set("Authorization", `Bearer ${accessToken}`)
  headers.set("Content-Type", "application/json")
  headers.set("Accept", "application/json")
  // eBay Sell APIs require a valid marketplace locale (e.g. en-US for EBAY_US).
  const locale = init?.contentLanguage || "en-US"
  headers.set("Content-Language", locale)
  headers.set("Accept-Language", locale)

  const method = (init?.method || "GET").toUpperCase()
  const response = await fetch(`${ebayApiBase()}${path}`, {
    ...init,
    headers,
  })

  const text = await response.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    // Do not retain raw body text in logs (may include address payloads).
    json = text ? { parseError: true } : null
  }

  const errors = extractEbayErrorDetails(json)
  logEbayInventoryResponse({
    method,
    path,
    status: response.status,
    ok: response.ok,
    errors,
  })

  if (!response.ok) {
    throw new MarketplaceError(
      formatEbayUserMessage(errors, response.status),
      "ebay_api_error",
      response.status
    )
  }

  return json
}
