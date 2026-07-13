# Listora

Mobile-first SaaS for resellers — AI listings, inventory, and crosslisting.

**Phase 1 (this repo state):** production-ready **AI Listing Generator** foundation.

## Quick start

```bash
pnpm install
cp .env.example .env.local
# add OPENAI_API_KEY=...
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Stack

- Next.js (App Router) + TypeScript
- AI SDK + OpenAI (`gpt-4o` by default)
- Tailwind CSS 4 + Base UI / shadcn-style primitives
- Vercel Analytics

## Docs

- [Development roadmap (all phases)](./docs/ROADMAP.md)
- [API reference (Phase 1)](./docs/API.md)

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Local development |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Lint |

## Phase 1 outputs

From product photos, Listora generates:

- eBay SEO titles (70–80 characters) + alternates
- Descriptions
- Categories
- Complete item specifics
- Keywords
- Pricing recommendations
- Confidence scores
- Missing-information warnings
