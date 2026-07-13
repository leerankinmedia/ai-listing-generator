# Listora — Development Roadmap

**Product:** Listora — AI-powered crosslisting & inventory SaaS for resellers  
**Stack:** Next.js (App Router) · TypeScript · Supabase (Auth + PostgreSQL) · Stripe · OpenAI · Vercel  
**Principle:** Build in phases. Never remove working features unless replacing with something better. Every marketplace is an isolated integration module.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Clients                                  │
│         Web (Next.js)  ·  Mobile-first PWA  ·  Admin             │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    Next.js API Layer                             │
│  /api/listings · /api/inventory · /api/billing · /api/marketplaces│
│  /api/ai/* · /api/webhooks/stripe · /api/webhooks/{marketplace}  │
└──────┬──────────────┬──────────────┬──────────────┬─────────────┘
       │              │              │              │
┌──────▼──────┐ ┌─────▼─────┐ ┌─────▼─────┐ ┌──────▼──────┐
│  Supabase   │ │  OpenAI   │ │  Stripe   │ │ Marketplace │
│  Auth + DB  │ │  Vision + │ │  Billing  │ │  Adapters   │
│  Storage    │ │  GPT      │ │           │ │  (pluggable)│
└─────────────┘ └───────────┘ └───────────┘ └─────────────┘
```

### Folder structure (target)

```
app/                          # Next.js App Router
  (marketing)/                # Landing, pricing, legal
  (auth)/                     # Login, signup, reset
  (app)/                      # Authenticated product shell
    dashboard/
    inventory/
    listings/
    analytics/
    offers/
    settings/
    onboarding/
  (admin)/                    # Admin dashboard
  api/                        # Route handlers
components/
  ui/                         # Design system primitives
  listing/                    # AI listing generator UI
  inventory/
  billing/
  layout/
lib/
  ai/                         # Prompts, schemas, generators
  marketplaces/               # One module per marketplace
    _core/                    # Shared adapter interface
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
  supabase/                   # Clients, RLS helpers
  stripe/
  inventory/
  types/
supabase/migrations/          # SQL migrations
docs/                         # Roadmap, API docs
```

### Marketplace adapter contract

Every marketplace implements:

```ts
interface MarketplaceAdapter {
  id: MarketplaceId
  capabilities: {
    list: boolean
    update: boolean
    delist: boolean
    syncInventory: boolean
    offers: boolean
    webhooks: boolean
  }
  auth: OAuthConfig | ApiKeyConfig
  createListing(item: CanonicalListing): Promise<ExternalListingRef>
  updateListing(ref: ExternalListingRef, item: CanonicalListing): Promise<void>
  delist(ref: ExternalListingRef): Promise<void>
  syncInventory?(cursor?: string): Promise<SyncPage>
  handleWebhook?(payload: unknown): Promise<WebhookResult>
  mapFromCanonical(item: CanonicalListing): MarketplacePayload
  mapToCanonical(payload: MarketplacePayload): Partial<CanonicalListing>
}
```

Canonical inventory is the source of truth. Marketplace-specific fields live in `listing_marketplace_data` JSONB. New marketplaces = new adapter module + migration row — no core rewrites.

---

## Database Structure (PostgreSQL / Supabase)

### Phase 1 (local / no auth yet)
- Listing generation is ephemeral (client + API). Optional local draft persistence via `localStorage`.

### Full schema (Phases 2+)

| Table | Purpose |
|-------|---------|
| `profiles` | Extends `auth.users` — name, role, trial dates, preferences |
| `subscriptions` | Stripe customer/subscription IDs, plan, status, period |
| `inventory_items` | SKU, title, description, cost, qty, location, barcode, status |
| `inventory_history` | Append-only audit of inventory changes |
| `listings` | Draft/active listing content + AI metadata (confidence, warnings) |
| `listing_images` | Storage paths, sort order, enhanced variants |
| `listing_marketplace_links` | Per-marketplace external IDs, status, last sync |
| `marketplace_accounts` | Connected OAuth tokens (encrypted), scopes |
| `offers` | Incoming/outgoing offers + automation rules |
| `bulk_jobs` | Async bulk list/edit/relist/price jobs |
| `notifications` | In-app + email notification queue |
| `ai_generations` | Usage metering for AI credits |
| `analytics_events` | Sales, views, fee events for dashboards |

**RLS:** Every user-owned table filtered by `auth.uid()`. Admin role via `profiles.role = 'admin'`.

**Indexes:** SKU, barcode, status, `search_vector` (tsvector), marketplace external IDs.

---

## API Design

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/ai/generate-listing` | Vision → structured eBay-optimized listing |
| `POST` | `/api/ai/enhance-image` | Background removal / enhancement (Phase 4) |
| `POST` | `/api/ai/price-suggest` | Standalone pricing (Phase 4) |
| `CRUD` | `/api/inventory` | Inventory items + search |
| `POST` | `/api/inventory/bulk` | Bulk actions |
| `CRUD` | `/api/listings` | Drafts & published listings |
| `POST` | `/api/listings/crosslist` | Publish to N marketplaces |
| `GET` | `/api/marketplaces` | Connected accounts + capabilities |
| `POST` | `/api/marketplaces/:id/connect` | OAuth start |
| `POST` | `/api/billing/checkout` | Stripe Checkout |
| `POST` | `/api/billing/portal` | Customer portal |
| `POST` | `/api/webhooks/stripe` | Subscription lifecycle |
| `POST` | `/api/webhooks/:marketplace` | Sale sync / delist triggers |

All APIs return `{ data, error, meta }` JSON. Documented in `docs/API.md` as endpoints ship.

---

## Authentication Flow

1. Supabase Auth (email/password + magic link; Google OAuth later).
2. Middleware protects `(app)` and `(admin)` route groups.
3. On signup → create `profiles` row → start **14-day trial** (`trial_ends_at`, no card required).
4. Trial expiry → soft lock to billing page; data retained.
5. Stripe Customer created on first checkout; webhook syncs plan to `subscriptions`.
6. Server components use `createServerClient`; client hooks use `createBrowserClient`.

---

## Billing Plans

| Plan | Trial | After trial |
|------|-------|-------------|
| Trial | 14 days, no card | — |
| Pro | — | Solo resellers |
| Business | — | Teams, higher AI/listing limits |
| Enterprise | — | Custom limits, SLA, SSO |

**No permanent free plan.** Feature gates via `lib/billing/entitlements.ts`.

---

## Phase Plan

### Phase 1 — Foundation & AI Listing Generator ✅ (this PR)
**Goal:** Production-quality AI listing generator that beats basic competitors on output quality and UX.

- [x] Audit existing project (source was missing from upload — reconstructed from build artifacts)
- [x] Full product roadmap & architecture docs
- [x] Modular Next.js + TypeScript app shell
- [x] AI Listing Generator improvements:
  - SEO eBay titles (70–80 characters)
  - Rich descriptions
  - Category suggestions
  - Complete item specifics
  - Keywords
  - Pricing recommendations
  - Confidence scores
  - Missing-information warnings
  - Premium, mobile-first UI
- [x] Documented `/api/generate-listing` (and alias `/api/ai/generate-listing`)
- [x] Scalable folder structure for later phases

**Out of scope for Phase 1:** Auth, Stripe, inventory DB, marketplace OAuth.

---

### Phase 2 — Auth, Billing & Onboarding
**Goal:** Multi-tenant SaaS shell with trial → paid conversion.

- Supabase project, migrations, RLS policies
- Auth UI (signup/login/reset) + session middleware
- Profile + subscription tables
- Stripe products (Pro / Business / Enterprise) + Checkout + Portal
- 14-day trial without credit card
- Onboarding wizard (business type, primary marketplaces, AI preferences)
- Settings & account management pages
- Entitlement middleware for AI usage limits
- User dashboard shell (empty states ready for inventory)

---

### Phase 3 — Inventory Core
**Goal:** Single source of truth for reseller stock.

- Inventory CRUD (SKU, drafts, cost, qty, storage location, barcode)
- Search (full-text + filters)
- Inventory history / audit log
- Profit tracking (cost vs sold price vs fees)
- Barcode scan UX (camera + manual)
- Draft ↔ listing linkage
- Basic analytics widgets (inventory value, sell-through)

---

### Phase 4 — AI Expansion
**Goal:** Deeper AI moat beyond listing copy.

- Image enhancement & background removal
- Automatic item specifics refinement from multi-photo sets
- Standalone AI pricing engine (comps-aware when data available)
- Bulk Generate from photo folders
- AI preference settings (tone, title formula, default condition)
- Generation history & credit metering UI

---

### Phase 5 — Crosslisting Platform (eBay first)
**Goal:** Pluggable marketplace architecture with eBay as reference implementation.

- `lib/marketplaces/_core` adapter interface
- eBay OAuth + Trading/Sell APIs (list, revise, end)
- Canonical ↔ eBay field mapping
- Publish draft → eBay from inventory
- Sale webhook / poll → auto-delist architecture
- Crosslist job queue (Vercel + Supabase or Inngest)

---

### Phase 6 — Additional Marketplaces
**Goal:** Expand reach beyond Nifty’s set.

Priority order (official API / partnership feasibility first):
1. Etsy, Shopify (strong official APIs)
2. eBay (already Phase 5)
3. Whatnot, Mercari (API availability dependent)
4. Poshmark, Depop, Grailed, Vinted, Facebook Marketplace (adapter stubs + automation-safe strategies where official APIs are limited)

Each marketplace ships as an isolated module with capability flags — no “fake” support in UI for unsupported actions.

---

### Phase 7 — Offers, Bulk Ops & Sync
**Goal:** Power-user operations that save hours/week.

- Offer inbox + automation rules (where supported)
- Bulk listing, editing, relisting, price updates
- Inventory sync + auto-delist across connected marketplaces
- Conflict resolution when multi-channel stock drifts
- Notifications (sale, offer, sync failure, trial ending)

---

### Phase 8 — Analytics, Admin & Polish
**Goal:** Compete on insights and reliability.

- Analytics dashboard (GMV, profit, sell-through, platform mix)
- Admin dashboard (users, plans, usage, support tools)
- Export (CSV / tax-ready)
- Performance, error monitoring, rate-limit hardening
- PWA polish for thrift-store mobile workflows
- Public API docs + partner webhook docs

---

## Scalability Notes

- **Horizontal:** Stateless Next.js on Vercel; DB on Supabase; heavy jobs via queue workers.
- **AI cost control:** Per-plan generation quotas; cache identical image hashes; use vision model only when needed.
- **Marketplace rate limits:** Per-adapter token bucket + exponential backoff.
- **Multi-tenancy:** RLS + org_id ready for Business/Enterprise team seats in Phase 2+.
- **Observability:** Structured logs, Sentry, Stripe + marketplace webhook idempotency keys.

---

## Phase 1 Acceptance Criteria

1. User can upload 1–8 photos (or paste notes) and generate a listing.
2. Output includes title (70–80 chars), description, category, item specifics, keywords, pricing, confidence, warnings.
3. UI is mobile-first, responsive, and professionally branded.
4. API is typed, validated with Zod, and documented.
5. Codebase structure is ready for Phase 2 without rewrites.
6. App builds successfully with TypeScript.
