# ListWise

AI-powered crosslisting for professional resellers.

## Phase 1

- Premium landing page with ListWise branding
- Login / Sign up (Supabase Auth + demo mode fallback)
- Authenticated dashboard shell
- Dark mode + mobile-first responsive UI
- Architecture stubs for marketplace adapters and AI listing generation

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4
- Supabase Auth (`@supabase/ssr`)
- OpenAI / AI SDK prepared for later phases
- next-themes for dark mode

## Getting started

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Auth modes

1. **Demo mode** — leave Supabase env vars empty. Any email/password signs you into the dashboard so you can explore the UI.
2. **Supabase mode** — set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` for real email/password auth.

## Project structure

```
app/                  # Routes: landing, login, signup, dashboard
components/           # UI, landing, auth, dashboard, theme
lib/
  auth/               # Server actions for sign in / up / out
  supabase/           # Browser + server clients, middleware helpers
  marketplaces/       # Registry + adapter contracts (stubs)
  ai/                 # Listing generator contract (stub)
  types/              # Shared domain types
```

## Planned marketplace integrations

eBay · Poshmark · Mercari · Depop · Grailed · Facebook Marketplace · Etsy · Vinted · Whatnot

Integrations are registered in `lib/marketplaces/registry.ts` and implement `MarketplaceAdapter` in later phases. Do not expect live syncing in Phase 1.

## Future phases

- AI listing generation (OpenAI)
- Crosslisting + auto delisting
- Offer automation
- Inventory management
- Analytics
- Marketplace OAuth + syncing
