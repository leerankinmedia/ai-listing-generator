/**
 * Validate + sanitize Inventory API createOrReplaceInventoryItem fields
 * before the outbound PUT. eBay error 25001 is often a vague wrap around
 * invalid SKU, condition, aspects, quantity, locale, images, or description.
 */

export const EBAY_INVENTORY_CONDITIONS = [
  "NEW",
  "LIKE_NEW",
  "NEW_OTHER",
  "NEW_WITH_DEFECTS",
  "MANUFACTURER_REFURBISHED",
  "CERTIFIED_REFURBISHED",
  "EXCELLENT_REFURBISHED",
  "VERY_GOOD_REFURBISHED",
  "GOOD_REFURBISHED",
  "SELLER_REFURBISHED",
  "USED_EXCELLENT",
  "USED_VERY_GOOD",
  "USED_GOOD",
  "USED_ACCEPTABLE",
  "FOR_PARTS_OR_NOT_WORKING",
] as const

export type EbayInventoryCondition = (typeof EBAY_INVENTORY_CONDITIONS)[number]

export const EBAY_INVENTORY_LOCALE = "en-US"
export const EBAY_PRODUCT_TITLE_MAX = 80
export const EBAY_PRODUCT_DESCRIPTION_MAX = 4000
export const EBAY_CONDITION_DESCRIPTION_MAX = 1000
export const EBAY_ASPECT_NAME_MAX = 40
export const EBAY_ASPECT_VALUE_MAX = 65
export const EBAY_SKU_MAX = 50
export const EBAY_IMAGE_URL_MAX = 500
export const EBAY_MAX_IMAGES = 24

export type EbayPackageWeightAndSize = {
  dimensions: {
    height: number
    length: number
    width: number
    unit: "INCH" | "CENTIMETER"
  }
  weight: {
    value: number
    unit: "POUND" | "KILOGRAM" | "OUNCE" | "GRAM"
  }
  packageType: string
}

export type EbayInventoryItemPayload = {
  availability: {
    shipToLocationAvailability: {
      quantity: number
    }
  }
  condition: EbayInventoryCondition
  conditionDescription?: string
  product: {
    title: string
    description: string
    aspects: Record<string, string[]>
    imageUrls: string[]
  }
  packageWeightAndSize?: EbayPackageWeightAndSize
}

export type InventoryFieldIssue = {
  field: string
  issue: string
  valuePreview?: string
}

function stripControlChars(value: string): string {
  // Keep tabs/newlines in descriptions; drop other C0 controls + DEL.
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
}

function preview(value: unknown, max = 80): string {
  const raw = typeof value === "string" ? value : JSON.stringify(value)
  if (!raw) return ""
  return raw.length > max ? `${raw.slice(0, max)}…` : raw
}

/** Inventory API SKU: 1–50 alphanumeric only (hyphens/underscores → 25707/25001). */
export function sanitizeEbayInventorySku(raw: string | undefined | null): {
  sku: string
  issues: InventoryFieldIssue[]
} {
  const issues: InventoryFieldIssue[] = []
  const input = typeof raw === "string" ? raw : ""
  const cleaned = input.replace(/[^a-zA-Z0-9]/g, "").slice(0, EBAY_SKU_MAX)
  if (!cleaned) {
    const fallback = `LW${Date.now()}`.replace(/[^a-zA-Z0-9]/g, "").slice(0, EBAY_SKU_MAX)
    issues.push({
      field: "sku",
      issue: "SKU was empty after alphanumeric sanitization; generated fallback",
      valuePreview: preview(input),
    })
    return { sku: fallback, issues }
  }
  if (cleaned !== input.trim()) {
    issues.push({
      field: "sku",
      issue: "SKU stripped to alphanumeric (1–50 chars) for Inventory API",
      valuePreview: preview(input),
    })
  }
  return { sku: cleaned, issues }
}

export function sanitizeEbayInventoryCondition(
  condition: string | undefined | null
): { condition: EbayInventoryCondition; issues: InventoryFieldIssue[] } {
  const issues: InventoryFieldIssue[] = []
  const raw = (condition || "").trim().toUpperCase()
  if ((EBAY_INVENTORY_CONDITIONS as readonly string[]).includes(raw)) {
    return { condition: raw as EbayInventoryCondition, issues }
  }
  issues.push({
    field: "condition",
    issue: `Unrecognized condition "${preview(condition)}"; defaulting to USED_EXCELLENT`,
    valuePreview: preview(condition),
  })
  return { condition: "USED_EXCELLENT", issues }
}

export function sanitizeEbayInventoryLocale(
  locale: string | undefined | null
): { locale: string; issues: InventoryFieldIssue[] } {
  const issues: InventoryFieldIssue[] = []
  const raw = (locale || "").trim()
  // Inventory Content-Language must be a BCP-47 tag eBay accepts for the site.
  if (/^[a-z]{2}-[A-Z]{2}$/.test(raw)) {
    return { locale: raw, issues }
  }
  if (raw && raw !== EBAY_INVENTORY_LOCALE) {
    issues.push({
      field: "locale",
      issue: `Invalid locale "${preview(raw)}"; using ${EBAY_INVENTORY_LOCALE}`,
      valuePreview: preview(raw),
    })
  }
  return { locale: EBAY_INVENTORY_LOCALE, issues }
}

export function sanitizeEbayProductAspects(
  aspects: Record<string, string[]> | undefined | null
): { aspects: Record<string, string[]>; issues: InventoryFieldIssue[] } {
  const issues: InventoryFieldIssue[] = []
  const out: Record<string, string[]> = {}
  if (!aspects || typeof aspects !== "object") {
    return { aspects: out, issues }
  }

  for (const [rawName, rawValues] of Object.entries(aspects)) {
    const name = stripControlChars(rawName || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, EBAY_ASPECT_NAME_MAX)
    if (!name) {
      issues.push({
        field: "product.aspects",
        issue: "Dropped aspect with empty name",
        valuePreview: preview(rawName),
      })
      continue
    }
    const values = (Array.isArray(rawValues) ? rawValues : [])
      .map((v) =>
        stripControlChars(String(v ?? ""))
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, EBAY_ASPECT_VALUE_MAX)
      )
      .filter(Boolean)
    if (values.length === 0) {
      issues.push({
        field: `product.aspects.${name}`,
        issue: "Dropped aspect with no non-empty values",
      })
      continue
    }
    // Dedupe while preserving order
    const seen = new Set<string>()
    const unique: string[] = []
    for (const v of values) {
      const key = v.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(v)
    }
    out[name] = unique
  }
  return { aspects: out, issues }
}

export function sanitizeEbayInventoryQuantity(
  quantity: unknown
): { quantity: number; issues: InventoryFieldIssue[] } {
  const issues: InventoryFieldIssue[] = []
  const n =
    typeof quantity === "number"
      ? quantity
      : typeof quantity === "string"
        ? Number(quantity)
        : NaN
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    issues.push({
      field: "availability.shipToLocationAvailability.quantity",
      issue: `Invalid quantity "${preview(quantity)}"; using 1`,
      valuePreview: preview(quantity),
    })
    return { quantity: 1, issues }
  }
  // eBay quantity is typically capped; keep a safe upper bound.
  if (n > 999999) {
    issues.push({
      field: "availability.shipToLocationAvailability.quantity",
      issue: `Quantity ${n} exceeds max; clamped to 999999`,
    })
    return { quantity: 999999, issues }
  }
  return { quantity: n, issues }
}

export function sanitizeEbayImageUrls(
  urls: string[] | undefined | null
): { imageUrls: string[]; issues: InventoryFieldIssue[] } {
  const issues: InventoryFieldIssue[] = []
  const out: string[] = []
  const seen = new Set<string>()
  const list = Array.isArray(urls) ? urls : []

  for (let i = 0; i < list.length; i++) {
    const raw = typeof list[i] === "string" ? list[i].trim() : ""
    if (!raw) {
      issues.push({
        field: `product.imageUrls[${i}]`,
        issue: "Dropped empty image URL",
      })
      continue
    }
    let parsed: URL
    try {
      parsed = new URL(raw)
    } catch {
      issues.push({
        field: `product.imageUrls[${i}]`,
        issue: "Dropped invalid image URL",
        valuePreview: preview(raw),
      })
      continue
    }
    if (parsed.protocol !== "https:") {
      issues.push({
        field: `product.imageUrls[${i}]`,
        issue: "Dropped non-HTTPS image URL",
        valuePreview: preview(raw),
      })
      continue
    }
    if (raw.length > EBAY_IMAGE_URL_MAX) {
      issues.push({
        field: `product.imageUrls[${i}]`,
        issue: `Image URL exceeds ${EBAY_IMAGE_URL_MAX} chars`,
        valuePreview: preview(raw),
      })
      continue
    }
    if (seen.has(raw)) {
      issues.push({
        field: `product.imageUrls[${i}]`,
        issue: "Dropped duplicate image URL",
        valuePreview: preview(raw, 60),
      })
      continue
    }
    seen.add(raw)
    out.push(raw)
    if (out.length >= EBAY_MAX_IMAGES) break
  }

  if (out.length === 0) {
    issues.push({
      field: "product.imageUrls",
      issue: "No valid HTTPS image URLs after sanitization",
    })
  }
  return { imageUrls: out, issues }
}

export function sanitizeEbayProductDescription(
  description: string | undefined | null
): { description: string; issues: InventoryFieldIssue[] } {
  const issues: InventoryFieldIssue[] = []
  let text = stripControlChars(description || "").trim()
  if (!text) {
    issues.push({
      field: "product.description",
      issue: "Description was empty; using placeholder",
    })
    text = "See photos for details."
  }
  if (text.length > EBAY_PRODUCT_DESCRIPTION_MAX) {
    issues.push({
      field: "product.description",
      issue: `Description truncated from ${text.length} to ${EBAY_PRODUCT_DESCRIPTION_MAX} chars`,
    })
    text = text.slice(0, EBAY_PRODUCT_DESCRIPTION_MAX)
  }
  return { description: text, issues }
}

export function sanitizeEbayProductTitle(
  title: string | undefined | null
): { title: string; issues: InventoryFieldIssue[] } {
  const issues: InventoryFieldIssue[] = []
  let text = stripControlChars(title || "")
    .replace(/\s+/g, " ")
    .trim()
  if (!text) {
    issues.push({
      field: "product.title",
      issue: "Title was empty; using placeholder",
    })
    text = "Listing"
  }
  if (text.length > EBAY_PRODUCT_TITLE_MAX) {
    issues.push({
      field: "product.title",
      issue: `Title truncated from ${text.length} to ${EBAY_PRODUCT_TITLE_MAX} chars`,
    })
    text = text.slice(0, EBAY_PRODUCT_TITLE_MAX)
  }
  return { title: text, issues }
}

export function sanitizeEbayPackageWeightAndSize(
  raw: unknown
): {
  packageWeightAndSize?: EbayPackageWeightAndSize
  issues: InventoryFieldIssue[]
  blockingIssues: InventoryFieldIssue[]
} {
  const issues: InventoryFieldIssue[] = []
  const blockingIssues: InventoryFieldIssue[] = []
  if (raw == null) {
    blockingIssues.push({
      field: "packageWeightAndSize",
      issue: "Missing package weight/dimensions (required for publishOffer)",
    })
    return { issues, blockingIssues }
  }
  if (!raw || typeof raw !== "object") {
    blockingIssues.push({
      field: "packageWeightAndSize",
      issue: "Invalid packageWeightAndSize object",
    })
    return { issues, blockingIssues }
  }

  const obj = raw as Record<string, unknown>
  const dims = (obj.dimensions || {}) as Record<string, unknown>
  const weight = (obj.weight || {}) as Record<string, unknown>

  const length = Number(dims.length)
  const width = Number(dims.width)
  const height = Number(dims.height)
  const weightValue = Number(weight.value)
  const packageType =
    typeof obj.packageType === "string" ? obj.packageType.trim() : ""

  if (!Number.isFinite(length) || length <= 0) {
    blockingIssues.push({
      field: "packageWeightAndSize.dimensions.length",
      issue: "Package length must be > 0",
      valuePreview: String(dims.length ?? ""),
    })
  }
  if (!Number.isFinite(width) || width <= 0) {
    blockingIssues.push({
      field: "packageWeightAndSize.dimensions.width",
      issue: "Package width must be > 0",
      valuePreview: String(dims.width ?? ""),
    })
  }
  if (!Number.isFinite(height) || height <= 0) {
    blockingIssues.push({
      field: "packageWeightAndSize.dimensions.height",
      issue: "Package height must be > 0",
      valuePreview: String(dims.height ?? ""),
    })
  }
  if (!Number.isFinite(weightValue) || weightValue <= 0) {
    blockingIssues.push({
      field: "packageWeightAndSize.weight.value",
      issue: "Package weight must be > 0",
      valuePreview: String(weight.value ?? ""),
    })
  }
  if (!packageType) {
    blockingIssues.push({
      field: "packageWeightAndSize.packageType",
      issue: "Package type is required",
    })
  }

  if (blockingIssues.length > 0) {
    return { issues, blockingIssues }
  }

  const dimUnit =
    dims.unit === "CENTIMETER" || dims.unit === "INCH" ? dims.unit : "INCH"
  if (dims.unit && dims.unit !== dimUnit) {
    issues.push({
      field: "packageWeightAndSize.dimensions.unit",
      issue: `Normalized dimension unit to ${dimUnit}`,
    })
  }

  const weightUnit =
    weight.unit === "POUND" ||
    weight.unit === "KILOGRAM" ||
    weight.unit === "OUNCE" ||
    weight.unit === "GRAM"
      ? weight.unit
      : "POUND"

  return {
    packageWeightAndSize: {
      dimensions: {
        length: Number(length.toFixed(2)),
        width: Number(width.toFixed(2)),
        height: Number(height.toFixed(2)),
        unit: dimUnit,
      },
      weight: {
        value: Number(weightValue.toFixed(3)),
        unit: weightUnit,
      },
      packageType,
    },
    issues,
    blockingIssues,
  }
}

export function sanitizeEbayConditionDescription(
  value: string | undefined | null
): { conditionDescription: string | undefined; issues: InventoryFieldIssue[] } {
  const issues: InventoryFieldIssue[] = []
  if (value == null) return { conditionDescription: undefined, issues }
  let text = stripControlChars(value).trim()
  if (!text) return { conditionDescription: undefined, issues }
  if (text.length > EBAY_CONDITION_DESCRIPTION_MAX) {
    issues.push({
      field: "conditionDescription",
      issue: `conditionDescription truncated from ${text.length} to ${EBAY_CONDITION_DESCRIPTION_MAX} chars`,
    })
    text = text.slice(0, EBAY_CONDITION_DESCRIPTION_MAX)
  }
  return { conditionDescription: text, issues }
}

/**
 * Full createOrReplaceInventoryItem body sanitization.
 * Throws Marketplace-ready issues list when required fields cannot be fixed.
 */
export function sanitizeEbayInventoryItemPayload(input: {
  sku: string
  inventoryItem: {
    availability?: {
      shipToLocationAvailability?: { quantity?: unknown }
    }
    condition?: string
    conditionDescription?: string
    product?: {
      title?: string
      description?: string
      aspects?: Record<string, string[]>
      imageUrls?: string[]
    }
    packageWeightAndSize?: unknown
  }
  locale?: string
}): {
  sku: string
  locale: string
  inventoryItem: EbayInventoryItemPayload
  issues: InventoryFieldIssue[]
  blockingIssues: InventoryFieldIssue[]
} {
  const issues: InventoryFieldIssue[] = []
  const { sku: cleanSku, issues: skuIssues } = sanitizeEbayInventorySku(input.sku)
  issues.push(...skuIssues)

  const { locale, issues: localeIssues } = sanitizeEbayInventoryLocale(input.locale)
  issues.push(...localeIssues)

  const raw = input.inventoryItem || {}
  const { condition, issues: conditionIssues } = sanitizeEbayInventoryCondition(
    raw.condition
  )
  issues.push(...conditionIssues)

  const { quantity, issues: qtyIssues } = sanitizeEbayInventoryQuantity(
    raw.availability?.shipToLocationAvailability?.quantity
  )
  issues.push(...qtyIssues)

  const { title, issues: titleIssues } = sanitizeEbayProductTitle(raw.product?.title)
  issues.push(...titleIssues)

  const { description, issues: descIssues } = sanitizeEbayProductDescription(
    raw.product?.description
  )
  issues.push(...descIssues)

  const { aspects, issues: aspectIssues } = sanitizeEbayProductAspects(
    raw.product?.aspects
  )
  issues.push(...aspectIssues)

  const { imageUrls, issues: imageIssues } = sanitizeEbayImageUrls(
    raw.product?.imageUrls
  )
  issues.push(...imageIssues)

  const { conditionDescription, issues: cdIssues } =
    sanitizeEbayConditionDescription(raw.conditionDescription)
  issues.push(...cdIssues)

  const {
    packageWeightAndSize,
    issues: pkgIssues,
    blockingIssues: pkgBlocking,
  } = sanitizeEbayPackageWeightAndSize(raw.packageWeightAndSize)
  issues.push(...pkgIssues)

  const inventoryItem: EbayInventoryItemPayload = {
    availability: {
      shipToLocationAvailability: { quantity },
    },
    condition,
    ...(conditionDescription ? { conditionDescription } : {}),
    product: {
      title,
      description,
      aspects,
      imageUrls,
    },
    ...(packageWeightAndSize ? { packageWeightAndSize } : {}),
  }

  const blockingIssues = [
    ...pkgBlocking,
    ...issues.filter(
      (i) =>
        i.field === "product.imageUrls" ||
        (i.field.startsWith("product.imageUrls[") && i.issue.includes("No valid"))
    ),
  ]
  if (imageUrls.length === 0) {
    blockingIssues.push({
      field: "product.imageUrls",
      issue: "At least one HTTPS image URL is required",
    })
  }

  return { sku: cleanSku, locale, inventoryItem, issues, blockingIssues }
}

/** Human-readable diagnosis when eBay returns opaque 25001. */
export function diagnoseEbayInventoryPayload(opts: {
  sku: string
  locale: string
  inventoryItem: EbayInventoryItemPayload
  priorIssues?: InventoryFieldIssue[]
}): string[] {
  const lines: string[] = []
  const item = opts.inventoryItem

  if (!/^[A-Za-z0-9]{1,50}$/.test(opts.sku)) {
    lines.push(`sku: must be 1–50 alphanumeric (got "${preview(opts.sku)}")`)
  }
  if (!/^[a-z]{2}-[A-Z]{2}$/.test(opts.locale)) {
    lines.push(`locale/Content-Language: invalid "${preview(opts.locale)}"`)
  }
  if (
    !(EBAY_INVENTORY_CONDITIONS as readonly string[]).includes(item.condition)
  ) {
    lines.push(`condition: invalid enum "${item.condition}"`)
  }
  const qty = item.availability.shipToLocationAvailability.quantity
  if (!Number.isInteger(qty) || qty < 1) {
    lines.push(`quantity: must be integer ≥ 1 (got ${qty})`)
  }
  if (!item.product.title?.trim()) {
    lines.push("product.title: missing")
  } else if (item.product.title.length > EBAY_PRODUCT_TITLE_MAX) {
    lines.push(`product.title: exceeds ${EBAY_PRODUCT_TITLE_MAX} chars`)
  }
  if (!item.product.description?.trim()) {
    lines.push("product.description: missing")
  } else if (item.product.description.length > EBAY_PRODUCT_DESCRIPTION_MAX) {
    lines.push(
      `product.description: exceeds ${EBAY_PRODUCT_DESCRIPTION_MAX} chars`
    )
  }
  if (
    item.conditionDescription &&
    item.conditionDescription.length > EBAY_CONDITION_DESCRIPTION_MAX
  ) {
    lines.push(
      `conditionDescription: exceeds ${EBAY_CONDITION_DESCRIPTION_MAX} chars`
    )
  }
  if (!item.product.imageUrls.length) {
    lines.push("product.imageUrls: empty")
  }
  item.product.imageUrls.forEach((url, i) => {
    if (!/^https:\/\//i.test(url)) {
      lines.push(`product.imageUrls[${i}]: not HTTPS`)
    }
  })
  if (!item.packageWeightAndSize) {
    lines.push("packageWeightAndSize: missing (required for publishOffer / error 25020)")
  } else {
    const pkg = item.packageWeightAndSize
    if (!(pkg.weight?.value > 0)) {
      lines.push("packageWeightAndSize.weight.value: must be > 0")
    }
    if (!(pkg.dimensions?.length > 0)) {
      lines.push("packageWeightAndSize.dimensions.length: must be > 0")
    }
    if (!(pkg.dimensions?.width > 0)) {
      lines.push("packageWeightAndSize.dimensions.width: must be > 0")
    }
    if (!(pkg.dimensions?.height > 0)) {
      lines.push("packageWeightAndSize.dimensions.height: must be > 0")
    }
    if (!pkg.packageType?.trim()) {
      lines.push("packageWeightAndSize.packageType: missing")
    }
  }
  for (const [name, values] of Object.entries(item.product.aspects || {})) {
    if (!name.trim()) lines.push("product.aspects: empty aspect name")
    if (!values?.length || values.every((v) => !String(v || "").trim())) {
      lines.push(`product.aspects.${name}: empty values`)
    }
    for (const v of values || []) {
      if (String(v).length > EBAY_ASPECT_VALUE_MAX) {
        lines.push(
          `product.aspects.${name}: value exceeds ${EBAY_ASPECT_VALUE_MAX} chars`
        )
      }
    }
  }

  for (const issue of opts.priorIssues || []) {
    lines.push(`${issue.field}: ${issue.issue}`)
  }

  return Array.from(new Set(lines))
}
