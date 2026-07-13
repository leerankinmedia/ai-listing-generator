"use client"

import { useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MARKETPLACES } from "@/lib/marketplaces"
import type { Listing, MarketplaceId } from "@/lib/types"
import { cn } from "@/lib/utils"

interface ListingEditorFormProps {
  listing: Listing
  onChange: (listing: Listing) => void
  disabled?: boolean
}

const CONDITIONS = [
  "New with tags",
  "New without tags",
  "Excellent",
  "Good",
  "Fair",
  "Poor",
]

export function ListingEditorForm({
  listing,
  onChange,
  disabled,
}: ListingEditorFormProps) {
  const keywordsText = useMemo(
    () => listing.keywords.join(", "),
    [listing.keywords]
  )

  function patch(partial: Partial<Listing>) {
    onChange({ ...listing, ...partial, updatedAt: new Date().toISOString() })
  }

  function patchSpecifics(partial: Listing["specifics"]) {
    patch({ specifics: { ...listing.specifics, ...partial } })
  }

  function toggleMarketplace(id: MarketplaceId) {
    const exists = listing.targetMarketplaces.includes(id)
    patch({
      targetMarketplaces: exists
        ? listing.targetMarketplaces.filter((m) => m !== id)
        : [...listing.targetMarketplaces, id],
    })
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Listing details</h2>
          <p className="text-sm text-muted-foreground">
            Edit anything before saving. Fields are ready for future marketplace publish.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">SEO title</Label>
          <Input
            id="title"
            value={listing.title}
            disabled={disabled}
            maxLength={120}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="Brand + item + key attributes"
          />
          <p className="text-xs text-muted-foreground">{listing.title.length}/120</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={listing.description}
            disabled={disabled}
            rows={10}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="Full marketplace-ready description"
            className="min-h-[200px]"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="price">Suggested price (USD)</Label>
            <Input
              id="price"
              type="number"
              min={0}
              step="0.01"
              value={listing.price || ""}
              disabled={disabled}
              onChange={(e) => patch({ price: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              value={listing.specifics.category ?? ""}
              disabled={disabled}
              onChange={(e) => patchSpecifics({ category: e.target.value })}
              placeholder="Men > Outerwear > Jackets"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Item specifics</h2>
          <p className="text-sm text-muted-foreground">
            Structured attributes mapped for eBay-style and fashion marketplaces.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["brand", "Brand"],
              ["size", "Size"],
              ["color", "Color"],
              ["material", "Material"],
              ["style", "Style"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                value={listing.specifics[key] ?? ""}
                disabled={disabled}
                onChange={(e) => patchSpecifics({ [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="space-y-2">
            <Label htmlFor="condition">Condition</Label>
            <select
              id="condition"
              disabled={disabled}
              value={listing.specifics.condition ?? "Good"}
              onChange={(e) => patchSpecifics({ condition: e.target.value })}
              className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <Label htmlFor="keywords">Keywords</Label>
          <p className="mb-2 text-sm text-muted-foreground">
            Comma-separated tags for search and future channel mapping.
          </p>
        </div>
        <Textarea
          id="keywords"
          value={keywordsText}
          disabled={disabled}
          rows={3}
          onChange={(e) =>
            patch({
              keywords: e.target.value
                .split(",")
                .map((k) => k.trim())
                .filter(Boolean),
            })
          }
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Publish targets</h2>
          <p className="text-sm text-muted-foreground">
            Select marketplaces for future one-click crosslisting. Publishing ships in a later phase.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MARKETPLACES.map((marketplace) => {
            const active = listing.targetMarketplaces.includes(marketplace.id)
            return (
              <button
                key={marketplace.id}
                type="button"
                disabled={disabled}
                onClick={() => toggleMarketplace(marketplace.id)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                  active
                    ? "border-accent/50 bg-accent/10"
                    : "border-border bg-card/60 hover:border-accent/30"
                )}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: marketplace.color }}
                />
                <span className="truncate font-medium">{marketplace.shortName}</span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
