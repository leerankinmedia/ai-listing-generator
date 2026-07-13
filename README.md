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
```

### Connect Supabase (production)

1. In Supabase → **Project Settings → API**, copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Publishable** (or legacy **anon**) key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Secret** (or legacy **service_role**) key → `SUPABASE_SERVICE_ROLE_KEY`
2. Paste those into `.env.local` (never commit this file).
3. Set `NEXT_PUBLIC_DEMO_AUTH=false`.
4. Apply SQL migrations in order (SQL Editor → New query → Run each file):
   - `supabase/migrations/001_listings.sql`
   - `supabase/migrations/002_listing_engine.sql`
   - `supabase/migrations/003_production_schema.sql`
5. Restart `pnpm dev`. Sign up a real user (not demo).

Also set `OPENAI_API_KEY` and `CONNECTIONS_SECRET` (≥16 chars).

### Dev without Supabase

Leave Supabase vars empty or as placeholders — the app uses demo auth + IndexedDB.

```bash
pnpm dev
```

## Stack

Next.js · TypeScript · Tailwind CSS · Supabase · OpenAI Vision · next-themes
