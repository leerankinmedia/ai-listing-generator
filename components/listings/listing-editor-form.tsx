"use client"

import { useMemo } from "react"
import { ConfidenceMeter } from "@/components/listings/confidence-meter"
import { CompsPricingPanel } from "@/components/listings/comps-pricing-panel"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MARKETPLACES } from "@/lib/marketplaces"
import type { DetectedFieldKey, Listing, MarketplaceId } from "@/lib/types"
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

function FieldHeader({
  label,
  htmlFor,
  fieldKey,
  listing,
}: {
  label: string
  htmlFor: string
  fieldKey: DetectedFieldKey
  listing: Listing
}) {
  const conf = listing.fieldConfidence?.[fieldKey]
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={htmlFor}>{label}</Label>
      <ConfidenceMeter confidence={conf?.confidence} />
    </div>
  )
}

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

  function patchFieldValue(fieldKey: DetectedFieldKey, value: string) {
    const prev = listing.fieldConfidence?.[fieldKey]
    if (!prev) return
    patch({
      fieldConfidence: {
        ...listing.fieldConfidence,
        [fieldKey]: { ...prev, value },
      },
    })
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
            Every field is editable. Confidence scores reflect Vision certainty.
          </p>
        </div>

        <div className="space-y-2">
          <FieldHeader
            label="SEO title"
            htmlFor="title"
            fieldKey="title"
            listing={listing}
          />
          <Input
            id="title"
            value={listing.title}
            disabled={disabled}
            maxLength={120}
            onChange={(e) => {
              patch({ title: e.target.value })
              patchFieldValue("title", e.target.value)
            }}
            placeholder="Brand + item + key attributes"
          />
          <p className="text-xs text-muted-foreground">
            {listing.title.length}/120
            {listing.fieldConfidence?.title?.rationale
              ? ` · ${listing.fieldConfidence.title.rationale}`
              : ""}
          </p>
        </div>

        <div className="space-y-2">
          <FieldHeader
            label="Description"
            htmlFor="description"
            fieldKey="description"
            listing={listing}
          />
          <Textarea
            id="description"
            value={listing.description}
            disabled={disabled}
            rows={10}
            onChange={(e) => {
              patch({ description: e.target.value })
              patchFieldValue("description", e.target.value)
            }}
            placeholder="Professional marketplace description"
            className="min-h-[200px]"
          />
        </div>

        <div className="space-y-2">
          <FieldHeader
            label="Category"
            htmlFor="category"
            fieldKey="category"
            listing={listing}
          />
          <Input
            id="category"
            value={listing.specifics.category ?? ""}
            disabled={disabled}
            onChange={(e) => {
              patchSpecifics({ category: e.target.value })
              patchFieldValue("category", e.target.value)
            }}
            placeholder="Men > Outerwear > Jackets"
          />
        </div>
      </section>

      <CompsPricingPanel
        comps={listing.comps}
        price={listing.price}
        disabled={disabled}
        onPriceChange={(price) => {
          patch({
            price,
            fieldConfidence: {
              ...listing.fieldConfidence,
              price: {
                value: String(price),
                confidence:
                  listing.fieldConfidence?.price?.confidence ??
                  listing.comps?.confidence ??
                  1,
                rationale: listing.fieldConfidence?.price?.rationale,
              },
            },
          })
        }}
      />

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Detected attributes</h2>
          <p className="text-sm text-muted-foreground">
            Vision detections across every uploaded photo, with confidence per field.
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
              ["pattern", "Pattern"],
              ["gender", "Gender"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-2">
              <FieldHeader
                label={label}
                htmlFor={key}
                fieldKey={key}
                listing={listing}
              />
              <Input
                id={key}
                value={listing.specifics[key] ?? ""}
                disabled={disabled}
                onChange={(e) => {
                  patchSpecifics({ [key]: e.target.value })
                  patchFieldValue(key, e.target.value)
                }}
              />
              {listing.fieldConfidence?.[key]?.rationale && (
                <p className="text-[11px] text-muted-foreground">
                  {listing.fieldConfidence[key]?.rationale}
                </p>
              )}
            </div>
          ))}

          <div className="space-y-2">
            <FieldHeader
              label="Condition"
              htmlFor="condition"
              fieldKey="condition"
              listing={listing}
            />
            <select
              id="condition"
              disabled={disabled}
              value={listing.specifics.condition ?? "Good"}
              onChange={(e) => {
                patchSpecifics({ condition: e.target.value })
                patchFieldValue("condition", e.target.value)
              }}
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

        <div className="space-y-2">
          <FieldHeader
            label="Flaws"
            htmlFor="flaws"
            fieldKey="flaws"
            listing={listing}
          />
          <Textarea
            id="flaws"
            value={listing.specifics.flaws ?? ""}
            disabled={disabled}
            rows={3}
            onChange={(e) => {
              patchSpecifics({ flaws: e.target.value })
              patchFieldValue("flaws", e.target.value)
            }}
            placeholder="Stains, wear, repairs, missing parts…"
          />
        </div>
      </section>

      <section className="space-y-3">
        <FieldHeader
          label="Keywords"
          htmlFor="keywords"
          fieldKey="keywords"
          listing={listing}
        />
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
            Select channels for one-click publish.
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
