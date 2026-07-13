# Listora

AI-powered crosslisting SaaS for professional resellers.

**Phase 1 (current):** production-minded AI Listing Generator — eBay SEO titles (70–80 chars), descriptions, categories, item specifics, keywords, pricing, confidence scores, and missing-info warnings.

## Stack

- Next.js 16 (App Router) + TypeScript
- OpenAI via Vercel AI SDK
- Tailwind CSS 4 + shadcn/ui
- Supabase / Stripe / marketplace adapters planned (see `docs/ROADMAP.md`)

## Quick start

```bash
pnpm install
cp .env.example .env.local
# add OPENAI_API_KEY
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Local development |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |

## API

See [`docs/API.md`](docs/API.md) for `POST /api/generate-listing`.

## Roadmap

Full multi-phase architecture, database plan, auth/billing, and marketplace adapter strategy: [`docs/ROADMAP.md`](docs/ROADMAP.md).
