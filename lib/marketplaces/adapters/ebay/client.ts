import type { Listing } from "@/lib/types"
import {
  colorIsBlackFamily,
  colorIsGrayFamily,
} from "@/lib/marketplaces/adapters/ebay/aspect-normalize"
import {
  diagnoseEbayInventoryPayload,
  sanitizeEbayInventoryItemPayload,
  sanitizeEbayInventorySku,
  type EbayInventoryItemPayload,
  type InventoryFieldIssue,
} from "@/lib/marketplaces/adapters/ebay/inventory-sanitize"
import type { EbayPackageWeightAndSize } from "@/lib/marketplaces/adapters/ebay/inventory-sanitize"
import { ebayApiBase } from "@/lib/marketplaces/adapters/ebay/oauth"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"
import { ebayConditionDescription } from "@/lib/listings/condition-details"
import { pickPublishSku } from "@/lib/listings/sku"
import { enrichEbayTitleTowardLimit } from "@/lib/listings/ebay-title"

export type EbayFetchInit = RequestInit & {
  contentLanguage?: string
  /** Labels which publish step made this call for logs + UI errors. */
  step?: string
  /** When true, do not auto-retry 25001 (used on the second attempt). */
  skip25001Retry?: boolean
  /**
   * When true, return HTTP 4xx/5xx instead of throwing MarketplaceError.
   * Used by the policy layer to inspect createFulfillmentPolicy 20403 bodies.
   */
  allowHttpError?: boolean
}

function listingQuantity(listing: Listing): number {
  const raw =
    listing.specifics.extras?.quantity ||
    listing.specifics.extras?.ebayQuantity ||
    "1"
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(999999, Math.floor(n))
}

export function mapListingToEbayInventory(listing: Listing) {
  const { sku } = sanitizeEbayInventorySku(pickPublishSku(listing))
  const title = enrichEbayTitleTowardLimit(listing.title, listing)

  const aspects: Record<string, string[]> = {}
  if (listing.specifics.brand) aspects.Brand = [listing.specifics.brand]
  if (listing.specifics.size) aspects.Size = [listing.specifics.size]
  // AI color wording (e.g. Dark Gray/Charcoal) is a starting point; publish
  // path normalizes Color onto the exact Taxonomy option (Gray) before PUT.
  if (listing.specifics.color) aspects.Color = [listing.specifics.color]
  if (listing.specifics.material) aspects.Material = [listing.specifics.material]
  if (listing.specifics.style) aspects.Style = [listing.specifics.style]
  if (listing.specifics.pattern) aspects.Pattern = [listing.specifics.pattern]
  if (listing.specifics.gender) {
    aspects.Department = [listing.specifics.gender]
  }
  // Seller/marketplace extras (Size Type, normalized Color, etc.).
  // Color/Colour from extras overwrite AI wording so a preselected Gray wins
  // over Dark Gray/Charcoal before aspect finalize — but never let a stale
  // Black extra override a gray-family detection.
  const detectedColor =
    listing.fieldConfidence?.color?.value || listing.specifics.color
  const skipExtraKeys = new Set([
    "sku",
    "quantity",
    "ebaysku",
    "ebayoriginalsku",
    "ebayquantity",
    "ebaylistingid",
    "ebayofferid",
    "source",
    "allowoffers",
  ])
  for (const [key, value] of Object.entries(listing.specifics.extras || {})) {
    const trimmed = value?.trim()
    if (!key.trim() || !trimmed) continue
    const keyLower = key.toLowerCase()
    if (skipExtraKeys.has(keyLower) || keyLower.startsWith("ebay")) continue
    const isColor = keyLower === "color" || keyLower === "colour"
    if (
      isColor &&
      colorIsGrayFamily(detectedColor) &&
      colorIsBlackFamily(trimmed)
    ) {
      continue
    }
    if (!aspects[key] || isColor) aspects[key] = [trimmed]
  }

  return {
    sku,
    inventoryItem: {
      availability: {
        shipToLocationAvailability: {
          quantity: listingQuantity(listing),
        },
      },
      condition: resolveInventoryCondition(listing),
      // Never invent wear — neutral statement when no verified flaws.
      conditionDescription: ebayConditionDescription(
        listing.specifics.flaws,
        listing.fieldConfidence?.flaws?.confidence
      ),
      product: {
        title: title.slice(0, 80),
        description: listing.description,
        aspects,
        // Populated by adapter after EPS / Media API upload
        imageUrls: [] as string[],
      },
      // Populated by adapter from seller-entered shippingPackage (never invented).
      packageWeightAndSize: undefined as EbayPackageWeightAndSize | undefined,
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
  // Exact verified array — no transformations, no dropping index 0.
  inventoryItem.product.imageUrls = [...imageUrls]
  return inventoryItem
}

/** Prefer Metadata-mapped Inventory enum when present on the listing. */
export function resolveInventoryCondition(listing: Listing): string {
  const fromPolicy = listing.specifics.ebayCondition?.conditionEnum?.trim()
  if (fromPolicy) return fromPolicy.toUpperCase()

  const fromExtra = listing.specifics.extras?.ebayConditionEnum?.trim()
  if (fromExtra) return fromExtra.toUpperCase()

  return mapConditionLabelToEnum(listing.specifics.condition)
}

function mapConditionLabelToEnum(condition?: string) {
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
    case "Pre-owned":
    case "Used":
      return "USED_EXCELLENT"
    default:
      return "USED_EXCELLENT"
  }
}

export function mapListingToEbayOffer(
  listing: Listing,
  sku: string,
  merchantLocationKey: string,
  policies: {
    fulfillmentPolicyId: string
    paymentPolicyId: string
    returnPolicyId: string
  },
  categoryId: string
) {
  const marketplaceId = process.env.EBAY_MARKETPLACE_ID || "EBAY_US"
  if (!merchantLocationKey) {
    throw new MarketplaceError(
      "merchantLocationKey is required to publish to eBay.",
      "ebay_location_missing",
      400
    )
  }
  if (!categoryId?.trim()) {
    throw new MarketplaceError(
      "Could not determine an eBay category",
      "ebay_category_undetermined",
      400
    )
  }
  if (
    !policies.fulfillmentPolicyId ||
    !policies.paymentPolicyId ||
    !policies.returnPolicyId
  ) {
    throw new MarketplaceError(
      "Valid eBay Business Policy IDs are required to publish.",
      "ebay_policy_missing",
      400
    )
  }

  const qty = listingQuantity(listing)
  const allowOffers =
    listing.specifics.allowOffers === true ||
    listing.specifics.extras?.allowOffers === "true"

  const listPrice = Number(listing.price) || 0
  const minAmount = Number(listing.specifics.extras?.minOfferAmount)
  const minPercent = Number(listing.specifics.extras?.minOfferPercent)
  const declineAmount = Number(listing.specifics.extras?.autoDeclineAmount)
  const declinePercent = Number(listing.specifics.extras?.autoDeclinePercent)

  const autoDeclineFromPercent =
    Number.isFinite(declinePercent) && declinePercent > 0 && listPrice > 0
      ? Number(((listPrice * declinePercent) / 100).toFixed(2))
      : null
  const autoDeclineFromAmount =
    Number.isFinite(declineAmount) && declineAmount > 0 ? declineAmount : null
  const autoDeclinePrice =
    autoDeclineFromAmount != null && autoDeclineFromPercent != null
      ? Math.max(autoDeclineFromAmount, autoDeclineFromPercent)
      : (autoDeclineFromAmount ?? autoDeclineFromPercent)

  // Inventory API bestOfferTerms support auto-accept/decline absolute prices.
  // Min offer % is expressed as autoDeclinePrice floor when provided.
  const minFromPercent =
    Number.isFinite(minPercent) && minPercent > 0 && listPrice > 0
      ? Number(((listPrice * minPercent) / 100).toFixed(2))
      : null
  const minFromAmount =
    Number.isFinite(minAmount) && minAmount > 0 ? minAmount : null
  const minFloor =
    minFromAmount != null && minFromPercent != null
      ? Math.max(minFromAmount, minFromPercent)
      : (minFromAmount ?? minFromPercent)

  const declineFloor =
    autoDeclinePrice != null && minFloor != null
      ? Math.max(autoDeclinePrice, minFloor)
      : (autoDeclinePrice ?? minFloor)

  const bestOfferTerms: Record<string, unknown> = {
    bestOfferEnabled: allowOffers,
  }
  if (allowOffers && declineFloor != null && declineFloor > 0) {
    bestOfferTerms.autoDeclinePrice = {
      value: declineFloor.toFixed(2),
      currency: listing.currency || "USD",
    }
  }

  return {
    sku,
    marketplaceId,
    format: "FIXED_PRICE" as const,
    listingDuration: "GTC",
    availableQuantity: qty,
    categoryId: categoryId.trim(),
    listingDescription: listing.description,
    listingPolicies: {
      fulfillmentPolicyId: policies.fulfillmentPolicyId,
      paymentPolicyId: policies.paymentPolicyId,
      returnPolicyId: policies.returnPolicyId,
      bestOfferTerms,
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

type EbayErrorParameter = { name?: string; value?: string }

type EbayErrorDetail = {
  errorId?: number
  domain?: string
  category?: string
  message?: string
  longMessage?: string
  parameters?: EbayErrorParameter[]
}

function isGenericEbayMessage(message?: string) {
  if (!message) return true
  const normalized = message.trim().toLowerCase()
  return (
    normalized === "system error" ||
    normalized === "error" ||
    normalized === "internal error" ||
    normalized === "unknown error" ||
    normalized.includes("core inventory service internal error")
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
    parameters?: EbayErrorParameter[]
  }

  const mapParams = (raw: unknown): EbayErrorParameter[] | undefined => {
    if (!Array.isArray(raw)) return undefined
    return raw.map((p) => {
      if (!p || typeof p !== "object") return {}
      const row = p as Record<string, unknown>
      return {
        name: typeof row.name === "string" ? row.name : undefined,
        value:
          typeof row.value === "string"
            ? row.value
            : row.value != null
              ? String(row.value)
              : undefined,
      }
    })
  }

  const fromArray = Array.isArray(payload.errors)
    ? payload.errors.map((err) => ({
        errorId: typeof err.errorId === "number" ? err.errorId : undefined,
        domain: typeof err.domain === "string" ? err.domain : undefined,
        category: typeof err.category === "string" ? err.category : undefined,
        message: typeof err.message === "string" ? err.message : undefined,
        longMessage:
          typeof err.longMessage === "string" ? err.longMessage : undefined,
        parameters: mapParams(err.parameters),
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
        parameters: mapParams(payload.parameters),
      },
    ]
  }

  return []
}

function formatEbayUserMessage(
  errors: EbayErrorDetail[],
  status: number,
  step?: string
) {
  const first = errors[0]
  const stepPrefix = step ? `[${step}] ` : ""
  if (!first) return `${stepPrefix}eBay API error (${status})`

  const shortMsg = sanitizeEbayText(first.message, 240)
  const longMsg = sanitizeEbayText(first.longMessage, 400)
  const preferred =
    (!isGenericEbayMessage(shortMsg) && shortMsg) ||
    (!isGenericEbayMessage(longMsg) && longMsg) ||
    shortMsg ||
    longMsg ||
    `eBay API error (${status})`

  const meta: string[] = []
  if (typeof first.errorId === "number") meta.push(`errorId=${first.errorId}`)
  if (first.domain) meta.push(`domain=${first.domain}`)
  if (first.category) meta.push(`category=${first.category}`)
  if (first.parameters?.length) {
    for (const p of first.parameters) {
      if (p.name && p.value) meta.push(`${p.name}=${sanitizeEbayText(p.value, 80)}`)
      else if (p.name) meta.push(p.name)
    }
  }

  const body =
    meta.length > 0 ? `${preferred} (${meta.join(", ")})` : preferred
  return `${stepPrefix}${body}`
}

const TRACE_HEADER_NAMES = [
  "rlogid",
  "x-ebay-c-request-id",
  "x-ebay-c-requestid",
  "x-ebay-request-id",
  "x-ebay-requestid",
  "x-request-id",
  "x-ebay-c-version",
  "x-ebay-soa-request-id",
] as const

function extractEbayTraceHeaders(response: Response): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of TRACE_HEADER_NAMES) {
    const value = response.headers.get(name)
    if (value) out[name] = value.slice(0, 200)
  }
  // Also capture any x-ebay-* headers we might have missed (no auth).
  response.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (
      (lower.startsWith("x-ebay") || lower === "rlogid") &&
      !out[lower] &&
      !/auth|token|secret|cookie/i.test(lower)
    ) {
      out[lower] = value.slice(0, 200)
    }
  })
  return out
}

function parseRequestBody(body: BodyInit | null | undefined): unknown {
  if (body == null) return null
  if (typeof body === "string") {
    try {
      return JSON.parse(body)
    } catch {
      return { raw: sanitizeEbayText(body, 2000) }
    }
  }
  return { note: "non-string body omitted from log" }
}

/**
 * Safe Inventory/Account API request/response logging (no tokens/secrets).
 */
function logEbayInventoryExchange(opts: {
  method: string
  path: string
  status: number
  ok: boolean
  step?: string
  sku?: string
  marketplaceId?: string
  locale?: string
  attempt?: number
  requestPayload?: unknown
  responseBody?: unknown
  responseText?: string
  traceHeaders?: Record<string, string>
  errors: EbayErrorDetail[]
}) {
  console.info("[ebay/inventory] exchange", {
    step: opts.step || null,
    method: opts.method,
    path: opts.path.split("?")[0],
    sku: opts.sku || null,
    marketplaceId: opts.marketplaceId || process.env.EBAY_MARKETPLACE_ID || "EBAY_US",
    locale: opts.locale || null,
    attempt: opts.attempt ?? 1,
    status: opts.status,
    ok: opts.ok,
    traceHeaders: opts.traceHeaders || {},
    requestPayload: opts.requestPayload ?? null,
    responseBody:
      opts.responseBody ??
      (opts.responseText
        ? { raw: sanitizeEbayText(opts.responseText, 4000) }
        : null),
    errors: opts.errors.map((err) => ({
      errorId: err.errorId,
      domain: err.domain,
      category: err.category,
      message: sanitizeEbayText(err.message),
      longMessage: sanitizeEbayText(err.longMessage),
      parameters: err.parameters,
    })),
  })
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function hasErrorId(errors: EbayErrorDetail[], id: number) {
  return errors.some((e) => e.errorId === id)
}

function skuFromInventoryPath(path: string): string | undefined {
  const match = path.match(/\/inventory_item\/([^/?#]+)/i)
  if (!match) return undefined
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

export async function ebayFetchResult(
  path: string,
  accessToken: string,
  init?: EbayFetchInit
): Promise<{ status: number; data: unknown; traceHeaders: Record<string, string> }> {
  const { contentLanguage, step, skip25001Retry, allowHttpError, ...fetchInit } =
    init || {}
  const headers = new Headers(fetchInit.headers)
  headers.set("Authorization", `Bearer ${accessToken}`)
  headers.set("Content-Type", "application/json")
  headers.set("Accept", "application/json")
  const locale = contentLanguage || "en-US"
  headers.set("Content-Language", locale)
  headers.set("Accept-Language", locale)

  const method = (fetchInit.method || "GET").toUpperCase()
  const requestPayload = parseRequestBody(fetchInit.body)
  const sku = skuFromInventoryPath(path)
  const marketplaceId = process.env.EBAY_MARKETPLACE_ID || "EBAY_US"

  const attemptOnce = async (attempt: number) => {
    const response = await fetch(`${ebayApiBase()}${path}`, {
      ...fetchInit,
      headers,
    })

    const text = await response.text()
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = text ? { parseError: true, raw: sanitizeEbayText(text, 2000) } : null
    }

    const errors = extractEbayErrorDetails(json)
    const traceHeaders = extractEbayTraceHeaders(response)

    logEbayInventoryExchange({
      method,
      path,
      status: response.status,
      ok: response.ok,
      step,
      sku,
      marketplaceId,
      locale,
      attempt,
      requestPayload,
      responseBody: json,
      responseText: text,
      traceHeaders,
      errors,
    })

    return { response, json, text, errors, traceHeaders }
  }

  let result = await attemptOnce(1)

  // One automatic retry for Core Inventory Service 25001 — still log both attempts.
  if (
    !result.response.ok &&
    !skip25001Retry &&
    step === "createOrReplaceInventoryItem" &&
    hasErrorId(result.errors, 25001)
  ) {
    console.warn("[ebay/inventory] retrying createOrReplaceInventoryItem after 25001", {
      sku: sku || null,
      marketplaceId,
      delayMs: 750,
      firstStatus: result.response.status,
      firstErrors: result.errors,
      firstTraceHeaders: result.traceHeaders,
    })
    await sleep(750)
    result = await attemptOnce(2)
  }

  if (!result.response.ok && !allowHttpError) {
    throw new MarketplaceError(
      formatEbayUserMessage(result.errors, result.response.status, step),
      "ebay_api_error",
      result.response.status,
      {
        ebay: {
          step: step || null,
          sku: sku || null,
          marketplaceId,
          locale,
          httpStatus: result.response.status,
          errorId: result.errors[0]?.errorId ?? null,
          errors: result.errors,
          responseBody: result.json,
          traceHeaders: result.traceHeaders,
          requestPayload,
        },
      }
    )
  }

  return {
    status: result.response.status,
    data: result.json,
    traceHeaders: result.traceHeaders,
  }
}

export async function ebayFetch(
  path: string,
  accessToken: string,
  init?: EbayFetchInit
) {
  const result = await ebayFetchResult(path, accessToken, init)
  return result.data
}

/**
 * Validate/sanitize inventory fields, PUT createOrReplaceInventoryItem,
 * retry once on 25001, and surface field-level diagnosis without hiding eBay's response.
 */
export async function createOrReplaceEbayInventoryItem(opts: {
  accessToken: string
  sku: string
  inventoryItem: ReturnType<typeof mapListingToEbayInventory>["inventoryItem"]
  locale?: string
}): Promise<{ sku: string; inventoryItem: EbayInventoryItemPayload }> {
  const sanitized = sanitizeEbayInventoryItemPayload({
    sku: opts.sku,
    inventoryItem: opts.inventoryItem,
    locale: opts.locale,
  })

  if (sanitized.blockingIssues.length > 0) {
    const detail = sanitized.blockingIssues
      .map((i) => `${i.field}: ${i.issue}`)
      .join("; ")
    throw new MarketplaceError(
      `[createOrReplaceInventoryItem] Inventory payload failed validation before send — ${detail}`,
      "ebay_inventory_payload_invalid",
      400,
      {
        ebay: {
          step: "createOrReplaceInventoryItem",
          sku: sanitized.sku,
          marketplaceId: process.env.EBAY_MARKETPLACE_ID || "EBAY_US",
          locale: sanitized.locale,
          httpStatus: 400,
          errorId: null,
          sanitizeIssues: sanitized.issues,
          requestPayload: sanitized.inventoryItem,
        },
      }
    )
  }

  if (sanitized.issues.length > 0) {
    console.info("[ebay/inventory] sanitized createOrReplaceInventoryItem fields", {
      sku: sanitized.sku,
      marketplaceId: process.env.EBAY_MARKETPLACE_ID || "EBAY_US",
      locale: sanitized.locale,
      issues: sanitized.issues,
    })
  }

  console.info("[ebay/inventory] outbound createOrReplaceInventoryItem", {
    step: "createOrReplaceInventoryItem",
    sku: sanitized.sku,
    marketplaceId: process.env.EBAY_MARKETPLACE_ID || "EBAY_US",
    locale: sanitized.locale,
    path: `/sell/inventory/v1/inventory_item/${sanitized.sku}`,
    requestPayload: sanitized.inventoryItem,
  })

  try {
    await ebayFetch(
      `/sell/inventory/v1/inventory_item/${encodeURIComponent(sanitized.sku)}`,
      opts.accessToken,
      {
        method: "PUT",
        step: "createOrReplaceInventoryItem",
        contentLanguage: sanitized.locale,
        body: JSON.stringify(sanitized.inventoryItem),
      }
    )
  } catch (err) {
    if (!(err instanceof MarketplaceError)) throw err
    const ebay = err.details?.ebay
    const diagnosis = diagnoseEbayInventoryPayload({
      sku: sanitized.sku,
      locale: sanitized.locale,
      inventoryItem: sanitized.inventoryItem,
      priorIssues: sanitized.issues,
    })

    const ebayErrorId = ebay?.errorId ?? null
    const paramHints =
      ebay?.errors
        ?.flatMap((e) => e.parameters || [])
        .filter((p) => p.name || p.value)
        .map((p) =>
          p.name && p.value ? `${p.name}=${p.value}` : p.name || p.value || ""
        )
        .filter(Boolean) || []

    const fieldHint =
      paramHints.length > 0
        ? `eBay field hints: ${paramHints.join("; ")}`
        : diagnosis.length > 0
          ? `Likely payload fields: ${diagnosis.slice(0, 8).join("; ")}`
          : "No local field violations detected after sanitization — eBay Core Inventory returned an opaque failure."

    const responsePreview = sanitizeEbayText(
      typeof ebay?.responseBody === "string"
        ? ebay.responseBody
        : JSON.stringify(ebay?.responseBody ?? null),
      800
    )

    const trace =
      ebay?.traceHeaders && Object.keys(ebay.traceHeaders).length > 0
        ? ` trace=${JSON.stringify(ebay.traceHeaders)}`
        : ""

    throw new MarketplaceError(
      `[createOrReplaceInventoryItem] Failed for SKU ${sanitized.sku} on ${
        ebay?.marketplaceId || process.env.EBAY_MARKETPLACE_ID || "EBAY_US"
      } (HTTP ${ebay?.httpStatus ?? err.status}, errorId=${ebayErrorId ?? "unknown"}). ${fieldHint} eBay response: ${
        responsePreview || err.message
      }.${trace}`,
      err.code || "ebay_api_error",
      err.status,
      {
        ...err.details,
        ebay: {
          ...(ebay || {
            step: "createOrReplaceInventoryItem",
            sku: sanitized.sku,
            marketplaceId: process.env.EBAY_MARKETPLACE_ID || "EBAY_US",
            locale: sanitized.locale,
            httpStatus: err.status,
            errorId: null,
          }),
          step: "createOrReplaceInventoryItem",
          sku: sanitized.sku,
          locale: sanitized.locale,
          sanitizeIssues: sanitized.issues as InventoryFieldIssue[],
          diagnosis,
          requestPayload: sanitized.inventoryItem,
        },
      }
    )
  }

  return { sku: sanitized.sku, inventoryItem: sanitized.inventoryItem }
}
