"use client"

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NullableNumberInput } from "@/components/ui/nullable-number-input"
import {
  DEFAULT_EBAY_PACKAGE_TYPE,
  missingShippingPackageFields,
  readShippingPresets,
  saveShippingPreset,
  type ShippingPackage,
  type ShippingPackagePreset,
} from "@/lib/listings/shipping-package"
import type { Listing } from "@/lib/types"

function blankPackage(): ShippingPackage {
  return {
    weightPounds: null,
    weightOunces: null,
    lengthInches: null,
    widthInches: null,
    heightInches: null,
    packageType: DEFAULT_EBAY_PACKAGE_TYPE,
  }
}

export function ShippingPackageFields({
  listing,
  onChange,
  disabled,
  compact,
}: {
  listing: Listing
  onChange: (listing: Listing) => void
  disabled?: boolean
  /** Hide the section heading when nested under Publish shipping. */
  compact?: boolean
}) {
  const pkg = listing.specifics.shippingPackage
  const [presets, setPresets] = useState<ShippingPackagePreset[]>([])
  const [presetName, setPresetName] = useState("")
  const missing = missingShippingPackageFields(pkg)

  useEffect(() => {
    setPresets(readShippingPresets())
  }, [])

  function patchPackage(partial: Partial<ShippingPackage>) {
    const current = pkg || blankPackage()
    const next: ShippingPackage = {
      ...current,
      ...partial,
      packageType: current.packageType || DEFAULT_EBAY_PACKAGE_TYPE,
    }
    onChange({
      ...listing,
      specifics: {
        ...listing.specifics,
        shippingPackage: next,
      },
      updatedAt: new Date().toISOString(),
    })
  }

  function applyPreset(id: string) {
    const preset = presets.find((p) => p.id === id)
    if (!preset) return
    patchPackage({
      weightPounds: preset.weightPounds,
      weightOunces: preset.weightOunces,
      lengthInches: preset.lengthInches,
      widthInches: preset.widthInches,
      heightInches: preset.heightInches,
      packageType: preset.packageType || DEFAULT_EBAY_PACKAGE_TYPE,
    })
  }

  function handleSavePreset() {
    const current = pkg
    if (!current || missingShippingPackageFields(current).length > 0) return
    const updated = saveShippingPreset(presetName || "Clothing package", {
      ...current,
      weightPounds: current.weightPounds ?? 0,
      weightOunces: current.weightOunces ?? 0,
      lengthInches: current.lengthInches ?? 0,
      widthInches: current.widthInches ?? 0,
      heightInches: current.heightInches ?? 0,
      packageType: current.packageType || DEFAULT_EBAY_PACKAGE_TYPE,
    })
    setPresets(updated)
    setPresetName("")
  }

  return (
    <div className="space-y-4">
      {!compact && (
        <div>
          <h3 className="text-sm font-semibold">Weight & dimensions</h3>
          <p className="text-xs text-muted-foreground">
            Enter packed weight and size — ListWise does not invent these for AI or
            imported clothing.
          </p>
        </div>
      )}

      {presets.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="shipping-preset">Saved package preset</Label>
          <select
            id="shipping-preset"
            disabled={disabled}
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) applyPreset(e.target.value)
              e.target.value = ""
            }}
            className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Choose a saved preset…</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.weightPounds ?? 0} lb {p.weightOunces ?? 0} oz ·{" "}
                {p.lengthInches}×{p.widthInches}×{p.heightInches} in)
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="weight-pounds">Weight pounds</Label>
          <NullableNumberInput
            id="weight-pounds"
            integer
            min={0}
            disabled={disabled}
            value={pkg ? pkg.weightPounds : null}
            placeholder="e.g. 1"
            onValueChange={(n) => patchPackage({ weightPounds: n })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="weight-ounces">Weight ounces</Label>
          <NullableNumberInput
            id="weight-ounces"
            min={0}
            step="0.1"
            disabled={disabled}
            value={pkg ? pkg.weightOunces : null}
            placeholder="e.g. 8"
            onValueChange={(n) => patchPackage({ weightOunces: n })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pkg-length">Length (in)</Label>
          <NullableNumberInput
            id="pkg-length"
            min={0}
            step="0.1"
            disabled={disabled}
            value={pkg ? pkg.lengthInches : null}
            placeholder="e.g. 12"
            onValueChange={(n) => patchPackage({ lengthInches: n })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pkg-width">Width (in)</Label>
          <NullableNumberInput
            id="pkg-width"
            min={0}
            step="0.1"
            disabled={disabled}
            value={pkg ? pkg.widthInches : null}
            placeholder="e.g. 9"
            onValueChange={(n) => patchPackage({ widthInches: n })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pkg-height">Height (in)</Label>
          <NullableNumberInput
            id="pkg-height"
            min={0}
            step="0.1"
            disabled={disabled}
            value={pkg ? pkg.heightInches : null}
            placeholder="e.g. 1"
            onValueChange={(n) => patchPackage({ heightInches: n })}
          />
        </div>
      </div>

      {missing.length > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-400" role="status">
          Before eBay publish, enter: {missing.join(", ")}.
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <Label htmlFor="preset-name">Save as preset (optional)</Label>
          <Input
            id="preset-name"
            disabled={disabled || missing.length > 0}
            value={presetName}
            placeholder="e.g. Soft poly mailer"
            onChange={(e) => setPresetName(e.target.value)}
          />
        </div>
        <button
          type="button"
          disabled={disabled || missing.length > 0}
          onClick={handleSavePreset}
          className="h-11 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-secondary disabled:opacity-50"
        >
          Save preset
        </button>
      </div>
    </div>
  )
}
