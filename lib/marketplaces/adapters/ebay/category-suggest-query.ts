/**
 * Pure helpers for Taxonomy suggestion queries (no eBay HTTP client).
 */

export type CategorySuggestQuery = {
  title?: string
  itemType?: string
  department?: string
  brand?: string
  keywords?: string[] | string
  categoryHint?: string
}

/** Build a Taxonomy suggestion query from AI listing fields. */
export function buildCategorySuggestionQuery(input: CategorySuggestQuery): string {
  const parts: string[] = []
  const push = (value?: string) => {
    const v = value?.trim()
    if (v) parts.push(v)
  }
  push(input.title)
  push(input.itemType)
  push(input.department)
  push(input.brand)
  push(input.categoryHint)
  if (Array.isArray(input.keywords)) {
    for (const kw of input.keywords.slice(0, 8)) push(kw)
  } else {
    push(input.keywords)
  }
  // Prefer distinctive tokens; keep reasonably short for the suggestions API.
  const unique: string[] = []
  const seen = new Set<string>()
  for (const part of parts.join(" ").split(/\s+/)) {
    const key = part.toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    unique.push(part)
    if (unique.length >= 16) break
  }
  return unique.join(" ").trim()
}
