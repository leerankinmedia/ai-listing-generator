# ListWise

AI-powered crosslisting platform for multi-marketplace sellers.

## Phase 1

- Modern landing page
- Login / Sign up (Supabase Auth)
- Protected dashboard shell
- Dark mode
- Mobile + desktop responsive UI
- Architecture stubs for future marketplace + AI features

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4
- Supabase Auth
- OpenAI-ready (`ai` + `@ai-sdk/openai` installed for later phases)
- next-themes

## Getting started

```bash
pnpm install
cp .env.example .env.local
# Add your Supabase URL + anon key (optional for demo mode)
pnpm dev
```

Without Supabase credentials, auth runs in **demo mode** — any email/password opens the dashboard.

## Project structure

```
app/                 # Routes: home, login, signup, dashboard, auth callback
components/
  landing/           # Homepage sections
  auth/              # Login / signup / sign-out
  dashboard/         # Shell + overview
  brand/             # Logo
  ui/                # Shared primitives
lib/
  marketplaces.ts    # Marketplace registry (eBay, Poshmark, …)
  types.ts           # Domain types for listings, inventory, AI, offers
  supabase/          # Browser + server clients + session helper
middleware.ts        # Auth gate for /dashboard
```

## Upcoming phases

- AI listing generation (OpenAI)
- Crosslisting + auto delisting
- Offer automation
- Inventory management
- Analytics
- Live marketplace OAuth / sync (eBay, Poshmark, Mercari, Depop, Grailed, Facebook Marketplace, Etsy, Vinted, Whatnot)
