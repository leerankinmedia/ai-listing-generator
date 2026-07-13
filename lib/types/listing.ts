export type ListingCondition =
  | "New with tags"
  | "New without tags"
  | "New with defects"
  | "Pre-owned - Excellent"
  | "Pre-owned - Good"
  | "Pre-owned - Fair"

export interface ItemSpecific {
  name: string
  value: string
}

export interface PricingSuggestion {
  suggestedPrice: number
  priceLow: number
  priceHigh: number
  currency: string
  rationale: string
  confidence: number
}

export interface MissingInfoWarning {
  field: string
  severity: "low" | "medium" | "high"
  message: string
  suggestion: string
}

export interface GeneratedListing {
  title: string
  titleCharacterCount: number
  description: string
  category: {
    primary: string
    path: string[]
    ebayCategoryHint: string
  }
  itemSpecifics: ItemSpecific[]
  keywords: string[]
  condition: ListingCondition
  brand: string | null
  color: string | null
  size: string | null
  material: string | null
  pricing: PricingSuggestion
  confidenceScore: number
  confidenceBreakdown: {
    identification: number
    titleSeo: number
    specificsCompleteness: number
    pricing: number
  }
  missingInformation: MissingInfoWarning[]
  detectedAttributes: {
    itemType: string
    style: string | null
    gender: string | null
    season: string | null
    pattern: string | null
  }
}

export interface GenerateListingRequest {
  images: string[]
  notes?: string
  conditionHint?: ListingCondition | null
  costBasis?: number | null
  targetMarketplace?: "ebay"
}

export interface ApiSuccessResponse<T> {
  data: T
  error: null
  meta: {
    model: string
    generatedAt: string
    phase: "1"
  }
}

export interface ApiErrorResponse {
  data: null
  error: {
    code: string
    message: string
  }
  meta: {
    phase: "1"
  }
}
