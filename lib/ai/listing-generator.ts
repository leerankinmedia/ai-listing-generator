/**
 * AI listing generation contracts.
 * OpenAI wiring lands in a later phase — types & stubs prepare the surface area.
 */

export interface ListingGenerationInput {
  images: string[]
  notes?: string
  categoryHint?: string
  brandHint?: string
  targetMarketplaces?: string[]
}

export interface GeneratedListingDraft {
  title: string
  description: string
  suggestedPrice: number
  condition: string
  category: string
  brand?: string
  size?: string
  tags: string[]
  marketplaceVariants?: Record<
    string,
    {
      title: string
      description: string
      price?: number
    }
  >
}

export interface ListingGenerator {
  generate(input: ListingGenerationInput): Promise<GeneratedListingDraft>
}

export class StubListingGenerator implements ListingGenerator {
  async generate(): Promise<GeneratedListingDraft> {
    throw new Error("AI listing generation ships in a future phase")
  }
}
