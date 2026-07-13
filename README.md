# ListWise

AI-powered crosslisting for modern resellers.

## Phase 1

- Marketing homepage
- Login / Sign up (Supabase Auth, with demo-mode fallback)
- Authenticated dashboard shell
- Dark mode + responsive layout
- Marketplace registry & domain types for future integrations

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4
- Supabase Auth (`@supabase/ssr`)
- OpenAI / AI SDK ready in dependencies
- next-themes for light/dark

## Getting started

```bash
pnpm install
cp .env.example .env.local   # optional — leave empty for demo auth
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Auth modes

| Mode | When | Behavior |
|------|------|----------|
| **Demo** | No Supabase env vars | Any email/password creates a session cookie and unlocks the dashboard |
| **Supabase** | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` set | Real sign-up / sign-in via Supabase Auth |

## Project structure

```
app/                  # Routes: /, /login, /signup, /dashboard + auth API
components/
  landing/            # Homepage sections
  auth/               # Auth forms & shell
  dashboard/          # Dashboard UI
  layout/             # Nav, logo, theme
  ui/                 # Primitives
lib/
  marketplaces/       # Channel registry (eBay, Poshmark, …)
  types/              # Inventory, listings, session types
  supabase/           # Browser, server, middleware clients
  auth/               # Demo session helpers
```

## Upcoming phases

AI listing generation · crosslisting · auto delisting · offer automation · inventory · analytics · marketplace syncing for eBay, Poshmark, Mercari, Depop, Grailed, Facebook Marketplace, Etsy, Vinted, and Whatnot.
