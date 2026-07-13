# ListWise

AI-powered crosslisting for professional multi-marketplace sellers.

## Phase 1

- Premium landing page
- Login / Sign up (Supabase + demo auth fallback)
- Dashboard shell with marketplace registry
- Dark mode + responsive navigation
- Architecture stubs for future AI, sync, automation, and analytics

## Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Without Supabase credentials, auth runs in **demo mode** (local session). Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for production auth.

## Stack

Next.js · TypeScript · Tailwind CSS · Supabase · OpenAI (ready) · next-themes
