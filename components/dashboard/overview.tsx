import {
  ArrowUpRight,
  Boxes,
  Link2,
  Sparkles,
  Store,
} from "lucide-react"
import { FUTURE_MODULES, MARKETPLACES } from "@/lib/marketplaces"
import { defaultMarketplaceConnections } from "@/lib/marketplaces"

const stats = [
  { label: "Active listings", value: "—", hint: "Connect a marketplace" },
  { label: "Inventory items", value: "0", hint: "Ready for Phase 2" },
  { label: "Channels connected", value: "0 / 9", hint: "OAuth coming soon" },
  { label: "AI drafts", value: "0", hint: "OpenAI wired next" },
]

export function DashboardOverview() {
  const connections = defaultMarketplaceConnections()

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">
          Dashboard
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Welcome to ListWise
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Your crosslisting command center is ready. Phase 1 unlocks auth and
          the product shell — AI generation, sync, and automations plug in next.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-border/80 bg-card/70 px-4 py-4"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {stat.label}
            </p>
            <p className="mt-2 font-display text-2xl font-bold text-foreground">
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
          </div>
        ))}
      </div>

      <section id="marketplaces" className="scroll-mt-24">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">
              Marketplace connections
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Architecture is ready — integrations ship in a later phase.
            </p>
          </div>
          <Store className="hidden h-5 w-5 text-muted-foreground sm:block" />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {MARKETPLACES.map((marketplace) => {
            const connection = connections.find((c) => c.id === marketplace.id)
            return (
              <div
                key={marketplace.id}
                className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card/60 px-4 py-3.5"
              >
                <span
                  className="h-9 w-9 shrink-0 rounded-xl"
                  style={{
                    background: `linear-gradient(135deg, ${marketplace.color}33, ${marketplace.color}99)`,
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {marketplace.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {connection?.status === "connected"
                      ? "Connected"
                      : "Not connected"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground opacity-70"
                  title="Coming in a future phase"
                >
                  Connect
                </button>
              </div>
            )
          })}
        </div>
      </section>

      <section id="inventory" className="scroll-mt-24">
        <h2 className="font-display text-xl font-semibold text-foreground">
          Quick actions
        </h2>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[
            {
              id: "ai",
              icon: Sparkles,
              title: "Generate AI listing",
              description: "Photo → title, description, tags",
            },
            {
              id: "crosslist",
              icon: Link2,
              title: "Crosslist item",
              description: "Publish to every connected channel",
            },
            {
              id: "inventory",
              icon: Boxes,
              title: "Add inventory",
              description: "Create your first SKU record",
            },
          ].map((action) => (
            <div
              key={action.id}
              id={action.id === "inventory" ? undefined : action.id}
              className="rounded-2xl border border-dashed border-border bg-secondary/30 px-4 py-5"
            >
              <action.icon className="h-5 w-5 text-primary" />
              <p className="mt-3 font-semibold text-foreground">{action.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {action.description}
              </p>
              <p className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                Coming soon
                <ArrowUpRight className="h-3 w-3" />
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="analytics" className="scroll-mt-24">
        <h2 className="font-display text-xl font-semibold text-foreground">
          Roadmap modules
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Typed module slots prepared in{" "}
          <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">
            lib/types.ts
          </code>{" "}
          and{" "}
          <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">
            lib/marketplaces.ts
          </code>
          .
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {FUTURE_MODULES.map((mod) => (
            <div
              key={mod.id}
              className="rounded-2xl border border-border/80 bg-card/50 px-4 py-4"
            >
              <p className="text-sm font-semibold text-foreground">{mod.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {mod.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="settings" className="scroll-mt-24 pb-8">
        <h2 className="font-display text-xl font-semibold text-foreground">
          Workspace settings
        </h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Profile, billing, notification preferences, and API keys will live
          here. For now, use the theme toggle and sign out from the sidebar.
        </p>
      </section>
    </div>
  )
}
