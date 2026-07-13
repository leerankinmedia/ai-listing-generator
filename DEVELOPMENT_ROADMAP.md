# Listora — Development Roadmap

**Product:** Listora — a mobile-first SaaS platform for professional resellers  
**Stack:** Next.js · TypeScript · Supabase · PostgreSQL · Stripe · OpenAI · Vercel  
**Goal:** Compete with and surpass Nifty across AI listing quality, inventory, crosslisting, and ops automation  
**Principle:** Build in phases. Never break working features. Every marketplace is an isolated module.

---

## Audit Summary (Pre–Phase 1)

| Finding | Severity | Resolution |
|--------|----------|------------|
| Repository contained only config (`package.json`, `tsconfig`, `next.config`, shadcn config, lockfile) — no `app/`, `components/`, or `lib/` | Critical | Rebuild application scaffold; restore AI Listing Generator as Phase 1 |
| Prior local source existed (evidenced by `tsconfig.tsbuildinfo`: `app/page.tsx`, `listing-form`, `photo-uploader`, `result-section`, `api/generate-listing`) but was never committed | Critical | Recreate and improve those modules with production architecture |
| `typescript.ignoreBuildErrors: true` | Medium | Keep temporarily during scaffold; tighten before Phase 2 |
| No `.env.example`, README, or API docs | Medium | Added in Phase 1 |
| No auth, DB, or billing | Expected | Phases 2–3 |
| Dependencies already include Next 16, React 19, AI SDK, Zod, shadcn/Tailwind 4 | Good | Reuse and extend |

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Clients                                  │
│   Web (Next.js App Router) · Mobile-responsive PWA (later)       │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    Next.js API Layer                             │
│  /api/ai/*  /api/inventory/*  /api/marketplaces/*  /api/billing/*│
│  /api/offers/*  /api/bulk/*  /api/webhooks/*                     │
└───────┬──────────────┬──────────────┬──────────────┬────────────┘
        │              │              │              │
   ┌────▼────┐   ┌─────▼─────┐  ┌────▼────┐   ┌─────▼─────┐
   │ OpenAI  │   │  Supabase │  │ Stripe  │   │Marketplace│
   │ AI SDK  │   │ Auth + DB │  │ Billing │   │ Adapters  │
   └─────────┘   │ Storage   │  └─────────┘   └─────┬─────┘
                 └───────────┘                      │
                          ┌─────────────────────────┼──────────────┐
                          │   Marketplace Adapter Interface         │
                          │  list · update · delist · sync · offers │
                          └─┬───┬───┬───┬───┬───┬───┬───┬───┬───┬──┘
                            eBay Posh Merc Dep Gra Vin Wha FB Etsy Shop
```

### Folder Structure (target)

```
app/                          # Next.js App Router (UI + route handlers)
  (marketing)/                # Landing, pricing, legal
  (auth)/                     # Login, signup, callback
  (app)/                      # Authenticated product shell
    dashboard/
    inventory/
    listings/
    generator/                # AI Listing Generator
    analytics/
    settings/
    billing/
  (admin)/                    # Admin dashboard
  api/
    ai/
    inventory/
    marketplaces/[platform]/
    billing/
    webhooks/
    bulk/
components/
  ui/                         # Design system primitives
  listing/                    # Generator & listing UI
  inventory/
  billing/
  layout/
lib/
  ai/                         # Prompts, schemas, generation
  supabase/                   # Clients, RLS helpers
  stripe/
  marketplaces/
    types.ts                  # Shared MarketplaceAdapter interface
    registry.ts               # Platform registration
    ebay/
    poshmark/
    mercari/
    depop/
    grailed/
    vinted/
    whatnot/
    facebook/
    etsy/
    shopify/
  inventory/
  analytics/
  utils/
types/
supabase/migrations/          # SQL migrations (source of truth)
docs/api/                     # OpenAPI / markdown API docs
```

### Marketplace Adapter Contract

Every platform implements:

```ts
interface MarketplaceAdapter {
  id: MarketplaceId
  capabilities: {
    list: boolean
    update: boolean
    delist: boolean
    syncInventory: boolean
    autoDelistOnSale: boolean
    offers: boolean
    bulk: boolean
  }
  connect(userId: string): Promise<OAuthResult>
  createListing(input: CanonicalListing): Promise<RemoteListing>
  updateListing(id: string, patch: Partial<CanonicalListing>): Promise<void>
  delist(id: string): Promise<void>
  syncInventory(userId: string): Promise<SyncResult>
  handleWebhook?(payload: unknown): Promise<WebhookResult>
  getOffers?(listingId: string): Promise<Offer[]>
  respondToOffer?(offerId: string, action: OfferAction): Promise<void>
}
```

New marketplaces = new module + registry entry. No core rewrites.

### Canonical Listing Model

Single internal representation mapped to/from each marketplace:

- identity: `sku`, `title`, `description`, `condition`, `brand`
- media: `images[]`
- taxonomy: `category`, `itemSpecifics`, `keywords`
- pricing: `price`, `cost`, `shipping`, `compareAt`
- inventory: `quantity`, `location`, `status` (`draft` | `active` | `sold` | `archived`)
- channel state: `listings[platform] → { remoteId, url, status, lastSyncedAt }`

### Database (PostgreSQL via Supabase) — Core Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User profile, role, onboarding state |
| `subscriptions` | Stripe customer/sub, plan, trial ends |
| `organizations` / `memberships` | Multi-user (Business+) |
| `inventory_items` | SKU, cost, location, status, media, AI fields |
| `inventory_events` | History/audit trail |
| `listings` | Per-channel listing rows linked to inventory |
| `marketplace_connections` | OAuth tokens (encrypted), scopes |
| `offers` | Inbound offers + automation rules |
| `bulk_jobs` / `bulk_job_items` | Async bulk operations |
| `notifications` | In-app + email queue metadata |
| `ai_generations` | Prompt/result audit for quality & cost |
| `admin_audit_logs` | Admin actions |

RLS on all user-owned tables. Service role only for webhooks/workers.

### Auth Flow

1. Supabase Auth (email/password + OAuth Google/Apple later)
2. Session via `@supabase/ssr` cookies in Next.js middleware
3. On signup → create `profiles` row + start 14-day trial (`subscriptions.status = trialing`, no card)
4. Middleware protects `(app)` and `(admin)` routes
5. Plan gating via `subscriptions.plan` + feature flags

### Billing (Stripe)

| Plan | Access |
|------|--------|
| Trial (14 days, no card) | Full Pro features |
| Pro | Solo reseller |
| Business | Team + higher limits |
| Enterprise | Custom limits, SLA, SSO later |

No permanent free plan. After trial → soft lock with upgrade CTA. Webhooks: `checkout.session.completed`, `customer.subscription.*`, `invoice.*`.

### API Design Principles

- REST-ish App Router handlers under `/api/*`
- Zod request/response schemas shared with clients
- Consistent envelope: `{ data, error?, meta? }`
- Idempotency keys for billing & marketplace writes
- Documented in `docs/api/` (OpenAPI generated from Zod in Phase 2+)

### Scalability

- Vercel serverless for request/response; queue (Inngest / Supabase + cron) for bulk & sync
- Marketplace rate limits handled inside each adapter with backoff
- Image storage in Supabase Storage (CDN)
- Read replicas / connection pooling (Supabase pooler) as volume grows
- Feature flags per plan and per marketplace rollout

---

## Phase Plan

### Phase 1 — Foundation & AI Listing Generator ✅ (this phase)

**Goals**
- Production-ready Next.js + TypeScript scaffold
- Improved AI Listing Generator (core differentiator)
- Premium mobile-first UI for generator
- Documented roadmap & env template

**Deliverables**
- SEO eBay titles (70–80 chars) with hard length enforcement
- Rich HTML-ready descriptions
- Category suggestions
- Complete item specifics
- Keywords
- Pricing recommendations (low / target / high)
- Confidence scores (overall + per field)
- Missing-information warnings
- Photo upload (client-side preview; vision when API key present)
- Demo/mock mode when `OPENAI_API_KEY` is absent
- Modular `lib/ai` + `lib/ebay` ready for later phases

**Out of scope:** Auth, Stripe, real marketplace APIs, inventory persistence

---

### Phase 2 — Auth, Database & Inventory Core

**Goals**
- Supabase Auth + PostgreSQL schema + RLS
- Inventory CRUD with SKUs, drafts, locations, cost/profit
- Save AI generations → inventory drafts
- Search, filters, inventory history events
- Onboarding wizard (first item → first listing draft)

**APIs:** `/api/inventory`, `/api/inventory/[id]`, `/api/inventory/[id]/events`  
**DB:** `profiles`, `inventory_items`, `inventory_events`, `ai_generations`

---

### Phase 3 — Stripe Subscriptions & Account

**Goals**
- 14-day free trial (no card)
- Pro / Business / Enterprise Checkout + Customer Portal
- Subscription gating middleware
- Settings + account management UI
- Email receipts via Stripe

**APIs:** `/api/billing/checkout`, `/api/billing/portal`, `/api/webhooks/stripe`

---

### Phase 4 — eBay Integration (First Marketplace)

**Goals**
- OAuth connect for eBay
- Push listing from inventory
- Inventory sync + sale → auto-delist elsewhere (hook)
- Prove adapter pattern end-to-end

**Module:** `lib/marketplaces/ebay`  
**Tables:** `marketplace_connections`, `listings`

---

### Phase 5 — Crosslisting Expansion

**Goals**
- Adapters for: Poshmark, Mercari, Depop, Grailed, Vinted, Whatnot, Facebook Marketplace, Etsy, Shopify
- Capability matrix UI (what each platform supports)
- Channel status panel per inventory item
- Sync workers + sale webhooks where official APIs allow

**Strategy:** Ship platforms with official APIs first; others via documented semi-automation / partner APIs with clear capability flags.

---

### Phase 6 — Bulk Operations & Offers

**Goals**
- Bulk list / edit / relist / price update / archive
- Job runner with progress UI
- Offer inbox + automation rules (auto-decline below X%, auto-counter)

**Tables:** `bulk_jobs`, `bulk_job_items`, `offers`, `offer_rules`

---

### Phase 7 — Advanced AI & Media

**Goals**
- AI pricing from comps (where data available)
- Image enhancement + background removal
- Auto item specifics from vision
- Barcode scanning (mobile camera) → product match

---

### Phase 8 — Dashboards, Admin, Analytics, Polish

**Goals**
- User dashboard (velocity, profit, channel mix)
- Analytics dashboard
- Admin dashboard (users, plans, usage, flags)
- Notifications center
- Performance, a11y, PWA polish, API docs completeness

---

## Phase Dependencies

```
Phase 1 (AI Generator)
    → Phase 2 (Auth + Inventory)
        → Phase 3 (Billing)
            → Phase 4 (eBay)
                → Phase 5 (Crosslisting)
                    → Phase 6 (Bulk + Offers)
                → Phase 7 (Advanced AI)  [can parallelize after Phase 2]
                    → Phase 8 (Dashboards / Admin)
```

---

## Success Metrics (product)

| Metric | Target direction |
|--------|------------------|
| Title length compliance | ≥95% of generations in 70–80 chars |
| Time to first draft listing | < 60 seconds |
| Trial → paid conversion | Track from Phase 3 |
| Crosslist success rate | Per-adapter SLOs from Phase 5 |
| Sync lag on sale | < 2 minutes where webhooks exist |

---

## Environment & Deploy

- **Dev:** local Next.js + Supabase local (from Phase 2)
- **Prod:** Vercel + Supabase + Stripe live + OpenAI
- Secrets via Vercel env; never commit keys
- Preview deployments per PR

---

*Last updated: Phase 1 kickoff*
