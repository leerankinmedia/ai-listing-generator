# Listora — Development Roadmap

> Production-ready, mobile-first SaaS for resellers. Competes with and surpasses Nifty.
> Stack: Next.js · TypeScript · Supabase · PostgreSQL · Stripe · OpenAI · Vercel

---

## Audit Summary (Phase 0)

**Finding:** The GitHub repo contained only scaffolding configs (`package.json`, `tsconfig`, `next.config`, `components.json`, lockfile). Application source was never uploaded, but `tsconfig.tsbuildinfo` confirms the prior app structure:

| Path | Role |
|------|------|
| `app/page.tsx` | Main listing generator page |
| `app/layout.tsx` | Root layout |
| `app/globals.css` | Tailwind styles |
| `app/api/generate-listing/route.ts` | OpenAI listing API |
| `components/listing-form.tsx` | Input form |
| `components/photo-uploader.tsx` | Image upload |
| `components/result-section.tsx` | Generated output |
| `components/ui/button.tsx` | shadcn button |
| `lib/utils.ts` | `cn()` helper |

**Bugs / gaps fixed in Phase 1:**
1. Missing source tree reconstructed and hardened
2. No structured schema / validation for AI output
3. Titles not constrained to eBay’s 70–80 character SEO window
4. Missing item specifics, keywords, pricing, confidence, and warnings
5. No production folder structure for future SaaS modules
6. `ignoreBuildErrors: true` removed; TypeScript must pass
7. No env example, README, or API documentation

---

## Product Vision

Listora helps resellers go from **photo → optimized multi-marketplace listing → inventory → sale → sync** in minutes, with AI that outperforms manual listing tools and a crosslisting engine designed for official APIs first.

**Pricing model (no permanent free plan):**
- **14-day free trial** (no credit card)
- **Pro** — solo sellers
- **Business** — teams / higher volume
- **Enterprise** — custom limits, SSO, dedicated support

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Clients                                  │
│   Mobile Web · Tablet · Desktop (Next.js App Router, RSC)        │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    Next.js API Layer                             │
│  /api/ai/*  /api/inventory/*  /api/marketplaces/*  /api/billing/*│
│  Auth middleware (Supabase SSR) · Rate limits · Zod validation   │
└──────────┬──────────────┬──────────────┬──────────────┬─────────┘
           │              │              │              │
     ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐  ┌────▼─────┐
     │  Supabase │  │  OpenAI   │  │  Stripe   │  │Marketplace│
     │  Auth+DB  │  │  Vision+  │  │  Billing  │  │ Adapters  │
     │  Storage  │  │  Chat     │  │  Webhooks │  │ (plugins) │
     └───────────┘  └───────────┘  └───────────┘  └─────┬─────┘
                                                        │
              ┌─────────────────────────────────────────┼──────────┐
              │ eBay │ Poshmark │ Mercari │ Depop │ … │ Shopify   │
              └────────────────────────────────────────────────────┘
```

### Folder Structure (target)

```
app/
  (marketing)/          # Landing, pricing, legal
  (auth)/               # Login, signup, callback
  (dashboard)/          # Authenticated app shell
    inventory/
    listings/
    analytics/
    settings/
    billing/
  (admin)/              # Admin dashboard
  api/
    ai/
    inventory/
    marketplaces/
    billing/
    webhooks/
components/
  ui/                   # Design system primitives
  listing/              # AI listing generator
  inventory/
  billing/
  layout/
lib/
  ai/                   # Prompts, schemas, providers
  supabase/             # Clients, RLS helpers
  stripe/
  marketplaces/         # One module per marketplace
    _core/              # Shared adapter interface
    ebay/
    poshmark/
    …
  inventory/
  analytics/
  types/
supabase/
  migrations/
docs/
```

### Marketplace Adapter Contract

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
  connect(oauth): Promise<Connection>
  createListing(item, opts): Promise<ExternalListing>
  updateListing(id, patch): Promise<void>
  delist(id): Promise<void>
  syncInventory?(sku): Promise<SyncResult>
  handleOffer?(offer): Promise<OfferAction>
}
```

New marketplaces = new folder under `lib/marketplaces/{id}` + registry entry. No core rewrites.

---

## Database Structure (PostgreSQL / Supabase)

### Core tables (Phased)

**Phase 2 — Auth & profiles**
- `profiles` — id (FK auth.users), display_name, avatar_url, role, onboarding_step, trial_ends_at, created_at
- `organizations` — team accounts (Business+)
- `organization_members` — user_id, org_id, role

**Phase 3 — Inventory**
- `inventory_items` — sku, title, description, condition, cost, quantity, location_id, status (draft|active|sold|archived), images[], category, item_specifics jsonb, barcodes, user_id/org_id
- `storage_locations` — name, barcode, parent_id
- `inventory_history` — item_id, action, before/after jsonb, actor_id
- `ai_generations` — input metadata, output jsonb, confidence, model, tokens

**Phase 4 — Billing**
- `subscriptions` — stripe_customer_id, stripe_subscription_id, plan, status, trial_ends_at, current_period_end
- `usage_events` — metering for AI gens, listings, seats

**Phase 5–6 — Marketplaces**
- `marketplace_connections` — user/org, marketplace, tokens (encrypted), scopes, status
- `external_listings` — inventory_item_id, marketplace, external_id, status, price, url, last_synced_at
- `sync_jobs` / `sync_events` — queue + audit
- `offers` — marketplace, external_offer_id, amount, status, auto_rules

**Phase 7+ — Automation**
- `bulk_jobs` — type, payload, progress, errors
- `offer_rules` — min_profit, auto_accept/counter thresholds
- `notifications` — in-app + email flags

All tables use RLS keyed to `auth.uid()` / org membership.

---

## API Design Principles

- REST under `/api/*`, versioned when breaking (`/api/v1/*` from Phase 5)
- Zod request/response schemas; OpenAPI-friendly JSDoc
- Idempotency keys on write endpoints that hit marketplaces
- Consistent envelope: `{ data, error?, meta? }`
- Auth: Supabase JWT on all protected routes
- Rate limiting per plan (Upstash or Vercel KV)

### Phase 1 APIs
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/generate-listing` | Vision + listing generation (structured) |

### Later (examples)
| Method | Path | Purpose |
|--------|------|---------|
| CRUD | `/api/inventory` | Inventory management |
| POST | `/api/inventory/bulk` | Bulk actions |
| POST | `/api/marketplaces/:id/connect` | OAuth start |
| POST | `/api/marketplaces/:id/listings` | Crosslist |
| POST | `/api/billing/checkout` | Stripe Checkout |
| POST | `/api/webhooks/stripe` | Billing events |
| POST | `/api/webhooks/:marketplace` | Sale/sync events |

---

## Authentication Flow

1. User signs up via Supabase Auth (email magic link / OAuth Google)
2. Trigger creates `profiles` row + starts **14-day trial** (`trial_ends_at`)
3. Middleware protects `(dashboard)` and `(admin)` routes
4. Trial users get full Pro features until trial ends
5. After trial → must subscribe via Stripe (no free forever tier)
6. Webhooks keep `subscriptions.status` in sync
7. Feature gates check `trial active OR subscription active`

---

## Marketplace Integration Strategy

**Priority order (API maturity & reseller demand):**
1. eBay (Inventory + Sell APIs) — Phase 5
2. Shopify, Etsy — Phase 6
3. Mercari, Poshmark, Depop, Grailed, Vinted — Phase 6–7 (official where available; documented adapters)
4. Whatnot, Facebook Marketplace — Phase 7+ (capability-limited)

**Sync rules:**
- Canonical inventory lives in Listora
- Sale webhook / poll → mark sold → enqueue delist on other connected marketplaces
- Conflict policy: first confirmed sale wins; others delist with audit trail

**Offers:**
- Capability flag per adapter
- User-defined rules: auto-accept above margin, auto-counter, ignore below floor

---

## Phase Plan

### Phase 1 — Foundation + AI Listing Generator ✅ (this PR)
- Reconstruct app from incomplete upload
- Production TypeScript layout
- Enhanced OpenAI listing generation:
  - SEO titles 70–80 chars
  - Descriptions, categories, full item specifics
  - Keywords, pricing recommendations
  - Confidence scores + missing-info warnings
- Premium mobile-first UI
- Docs: roadmap, API notes, env example

### Phase 2 — Auth, Profiles, App Shell
- Supabase Auth + SSR middleware
- Profiles, onboarding wizard
- Dashboard layout (nav, mobile bottom bar)
- Settings / account pages
- Protect AI generator behind auth + trial

### Phase 3 — Inventory Core
- SKUs, drafts, locations, cost/profit fields
- Search, filters, history audit log
- Barcode scanning (camera + USB wedge)
- Save AI output → inventory draft
- Basic analytics (counts, value, margins)

### Phase 4 — Stripe Billing
- Products: Pro / Business / Enterprise
- 14-day trial, no card required
- Checkout, Customer Portal, webhooks
- Plan gates + usage metering for AI

### Phase 5 — eBay Integration
- OAuth connect
- Create/update/end listings from inventory
- Category + item specifics mapping from AI output
- Sale webhook → mark sold

### Phase 6 — Crosslisting Platform
- Adapter registry + job queue (Inngest/Trigger.dev)
- Shopify, Etsy, Mercari, Poshmark, Depop adapters (as APIs allow)
- Inventory sync + auto-delist pipeline
- Connection health UI

### Phase 7 — Bulk Ops & Offers
- Bulk list / edit / relist / price update
- Offer inbox + automation rules
- Notification center

### Phase 8 — Advanced AI
- Image enhancement + background removal
- Auto item specifics refinement from category taxonomy
- Pricing model improvements (comps signals)
- Bulk AI rewrite

### Phase 9 — Admin, Scale, Polish
- Admin dashboard (users, plans, abuse)
- Analytics dashboard (GMV proxy, sell-through)
- Performance, observability, OpenAPI docs
- Enterprise SSO / seats

---

## Long-Term Scalability

- **Stateless Next.js** on Vercel; heavy jobs on background workers
- **Supabase** for auth, Postgres, storage, realtime notifications
- **Horizontal marketplace adapters** — isolated failure domains
- **Queue-based sync** — retries, dead-letter, idempotency
- **Encrypted token vault** for marketplace OAuth secrets
- **Feature flags** per plan and gradual rollout
- **Observability**: structured logs, Sentry, AI cost tracking
- **Multi-tenant RLS** from day one (user → org ready)

---

## Phase 1 Success Criteria

- [x] Roadmap documented
- [x] App builds and runs
- [x] Generate listing from photos + optional details
- [x] Title length enforced/validated 70–80
- [x] Description, category, item specifics, keywords, pricing, confidence, warnings returned
- [x] Responsive, professional UI
- [x] Modular code ready for Phase 2+
