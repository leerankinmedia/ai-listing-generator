# ListWise

AI-powered crosslisting for professional multi-marketplace sellers.

## Phase 1

- Premium landing page
- Login / Sign up (Supabase + demo auth fallback)
- Dashboard shell with marketplace registry
- Dark mode + responsive navigation

## Phase 2

- AI Listing Generator with drag-and-drop upload (up to 24 photos)
- OpenAI Vision analysis → SEO title, description, specifics, price, keywords
- Editable draft before save
- Persist listings (Supabase when configured, IndexedDB demo fallback)
- Publish-ready listing shape for future marketplace adapters

## Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

### Environment

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` | Auth + listings table |
| `OPENAI_API_KEY` | Live Vision generation |
| `NEXT_PUBLIC_DEMO_AUTH` | Force local demo auth |

Without Supabase/OpenAI credentials, demo auth + demo Vision drafts still work for UI walkthroughs.

Apply `supabase/migrations/001_listings.sql` in your Supabase project for production persistence.

## Stack

Next.js · TypeScript · Tailwind CSS · Supabase · OpenAI · next-themes
