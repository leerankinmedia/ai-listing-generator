# ListWise

AI-powered crosslisting for professional multi-marketplace sellers.

## Phase 3 — Production AI Listing Engine

- Upload up to **24** photos (drag-and-drop, mobile-first)
- **Every image** analyzed with OpenAI Vision (`gpt-4o`)
- Detects brand, category, size, color, material, style, pattern, gender, condition, flaws
- Generates SEO title, professional description, item specifics, keywords
- **Sold comps** pricing with low / suggested / high range
- **Confidence score** on every detected / generated field
- Fully editable before save
- Persist to Supabase (or IndexedDB fallback)
- **One-click publish** orchestration ready for marketplace adapters

## Setup

```bash
pnpm install
cp .env.example .env.local
# Required: OPENAI_API_KEY
pnpm dev
```

Apply migrations:
- `supabase/migrations/001_listings.sql`
- `supabase/migrations/002_listing_engine.sql`

## Engine pipeline

1. Batch Vision detection across all photos  
2. Merge attributes by confidence / consensus  
3. Generate copy from verified attributes  
4. Estimate sold-comps pricing (`CompsProvider` — AI now, eBay sold API later)  
5. Review → save → one-click publish queue  

## Stack

Next.js · TypeScript · Tailwind CSS · Supabase · OpenAI Vision · next-themes
