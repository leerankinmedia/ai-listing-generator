import type { GeneratedListingOutput } from "@/lib/listings/schema"
import type {
  DetectedFieldKey,
  FieldConfidence,
  Listing,
  ListingSpecifics,
  SoldCompsEstimate,
} from "@/lib/types"

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim()
  if (value && typeof value === "object" && "value" in value) {
    const inner = (value as { value?: unknown }).value
    if (typeof inner === "string") return inner.trim()
    if (Array.isArray(inner)) return inner.map(String).join(", ").trim()
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return ""
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value)
  }
  return fallback
}

function asKeywords(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((k) => String(k).trim()).filter(Boolean)
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)
  }
  return []
}

function asConfidence(
  entry: unknown,
  fallbackValue = ""
): FieldConfidence | undefined {
  if (!entry || typeof entry !== "object") {
    if (!fallbackValue) return undefined
    return { value: fallbackValue, confidence: 0 }
  }
  const record = entry as Record<string, unknown>
  const value = asString(record.value) || fallbackValue
  const confidence = asNumber(record.confidence, 0)
  const rationale =
    typeof record.rationale === "string" ? record.rationale : undefined
  return {
    value,
    confidence: Math.max(0, Math.min(1, confidence)),
    rationale,
  }
}

/**
 * Hardened draft → listing field mapper.
 * Guards against nested shapes / missing top-level title that caused blank UI fields.
 */
export function mapDraftToListingFields(draft: GeneratedListingOutput): {
  title: string
  description: string
  price: number
  currency: string
  keywords: string[]
  specifics: ListingSpecifics
  fieldConfidence: Listing["fieldConfidence"]
  comps: SoldCompsEstimate
} {
  const conf = draft.fieldConfidence ?? {}

  const title =
    asString(draft.title) ||
    asString(conf.title) ||
    asString((draft as { title?: unknown }).title)

  const description =
    asString(draft.description) || asString(conf.description)

  const price = asNumber(
    draft.price,
    asNumber(draft.comps?.suggestedPrice, asNumber(conf.price?.value, 0))
  )

  const keywords =
    asKeywords(draft.keywords).length > 0
      ? asKeywords(draft.keywords)
      : asKeywords(conf.keywords?.value)

  const specificsSource = draft.specifics ?? {}
  const specifics: ListingSpecifics = {
    brand: asString(specificsSource.brand) || asString(conf.brand) || undefined,
    size: asString(specificsSource.size) || asString(conf.size) || undefined,
    color: asString(specificsSource.color) || asString(conf.color) || undefined,
    material:
      asString(specificsSource.material) || asString(conf.material) || undefined,
    style: asString(specificsSource.style) || asString(conf.style) || undefined,
    pattern:
      asString(specificsSource.pattern) || asString(conf.pattern) || undefined,
    gender:
      asString(specificsSource.gender) || asString(conf.gender) || undefined,
    condition:
      asString(specificsSource.condition) ||
      asString(conf.condition) ||
      undefined,
    category:
      asString(specificsSource.category) ||
      asString(conf.category) ||
      undefined,
    flaws: asString(specificsSource.flaws) || asString(conf.flaws) || undefined,
  }

  const fieldKeys: DetectedFieldKey[] = [
    "brand",
    "category",
    "size",
    "color",
    "material",
    "style",
    "pattern",
    "gender",
    "condition",
    "flaws",
    "title",
    "description",
    "price",
    "keywords",
  ]

  const fieldConfidence: Listing["fieldConfidence"] = {}
  for (const key of fieldKeys) {
    const fallback =
      key === "title"
        ? title
        : key === "description"
          ? description
          : key === "price"
            ? String(price)
            : key === "keywords"
              ? keywords.join(", ")
              : (specifics[key as keyof ListingSpecifics] as string | undefined) ||
                ""
    const mapped = asConfidence(conf[key], fallback)
    if (mapped) fieldConfidence[key] = mapped
  }

  if (!title) {
    throw new Error(
      "AI returned an empty title. Please retry analysis with clearer photos."
    )
  }

  const compsRaw = draft.comps
  const comps: SoldCompsEstimate = {
    suggestedPrice: asNumber(compsRaw?.suggestedPrice, price),
    lowPrice: asNumber(compsRaw?.lowPrice, price),
    highPrice: asNumber(compsRaw?.highPrice, price),
    currency: "USD",
    confidence: asNumber(compsRaw?.confidence, fieldConfidence.price?.confidence ?? 0),
    method: compsRaw?.method === "ebay_sold_api" ? "ebay_sold_api" : "ai_market_comps",
    rationale: asString(compsRaw?.rationale) || "Sold comps estimate",
    comparableSummary: asString(compsRaw?.comparableSummary) || undefined,
    sampleSize:
      typeof compsRaw?.sampleSize === "number"
        ? compsRaw.sampleSize
        : undefined,
  }

  return {
    title,
    description,
    price,
    currency: draft.currency === "USD" ? "USD" : "USD",
    keywords,
    specifics,
    fieldConfidence,
    comps,
  }
}

export function getPersistenceMode(): "supabase" | "indexeddb" {
  // Client-safe check mirrors isSupabaseConfigured without throwing
  if (typeof window === "undefined") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (
      url &&
      key &&
      url !== "https://your-project.supabase.co"
    ) {
      return "supabase"
    }
    return "indexeddb"
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (url && key && url !== "https://your-project.supabase.co") {
    return "supabase"
  }
  return "indexeddb"
}
