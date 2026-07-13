# Listora

Mobile-first SaaS for professional resellers. AI listing generation, inventory, and crosslisting — built to compete with Nifty.

> **Phase 1:** AI Listing Generator (this release)  
> Full plan: [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md)

## Stack

- Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui
- Vercel AI SDK · OpenAI
- Planned: Supabase · Stripe · Vercel

## Quick start

```bash
pnpm install
cp .env.example .env.local
# Add OPENAI_API_KEY for live generation (optional — demo mode works without it)
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Phase 1 features

- eBay-optimized titles (70–80 characters)
- Descriptions, categories, item specifics, keywords
- Pricing recommendations with confidence scores
- Missing-information warnings
- Photo upload + vision when an API key is present
- Demo mode when `OPENAI_API_KEY` is unset

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Lint |

## Environment

See `.env.example`.
