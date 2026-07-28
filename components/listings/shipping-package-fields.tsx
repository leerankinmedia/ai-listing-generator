"use client"

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DEFAULT_EBAY_PACKAGE_TYPE,
  missingShippingPackageFields,
  readShippingPresets,
  saveShippingPreset,
  type ShippingPackage,
  type ShippingPackagePreset,
} from "@/lib/listings/shipping-package"
import type { Listing } from "@/lib/types"

const EMPTY_PACKAGE: ShippingPackage = {
  weightPounds: 0,
  weightOunces: 0,
  lengthInches: 0,
  widthInches: 0,
  heightInches: 0,
  packageType: DEFAULT_EBAY_PACKAGE_TYPE,
}

export function ShippingPackageFields({
  listing,
  onChange,
  disabled,
}: {
  listing: Listing
  onChange: (listing: Listing) => void
  disabled?: boolean
}) {
  const pkg = listing.specifics.shippingPackage
  const [presets, setPresets] = useState<ShippingPackagePreset[]>([])
  const [presetName, setPresetName] = useState("")
  const missing = missingShippingPackageFields(pkg)

  useEffect(() => {
    setPresets(readShippingPresets())
  }, [])

  function patchPackage(partial: Partial<ShippingPackage>) {
    const current = pkg || EMPTY_PACKAGE
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
      packageType: current.packageType || DEFAULT_EBAY_PACKAGE_TYPE,
    })
    setPresets(updated)
    setPresetName("")
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Weight & dimensions</h3>
        <p className="text-xs text-muted-foreground">
          Enter packed weight and size — ListWise does not invent these for AI or imported
          clothing.
        </p>
      </div>

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
                {p.name} ({p.weightPounds} lb {p.weightOunces} oz · {p.lengthInches}×
                {p.widthInches}×{p.heightInches} in)
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="weight-pounds">Weight pounds</Label>
          <Input
            id="weight-pounds"
            type="number"
            min={0}
            step={1}
            disabled={disabled}
            value={pkg?.weightPounds ?? ""}
            placeholder="0"
            onChange={(e) =>
              patchPackage({
                weightPounds: e.target.value === "" ? 0 : Number(e.target.value),
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="weight-ounces">Weight ounces</Label>
          <Input
            id="weight-ounces"
            type="number"
            min={0}
            step={0.1}
            disabled={disabled}
            value={pkg?.weightOunces ?? ""}
            placeholder="0"
            onChange={(e) =>
              patchPackage({
                weightOunces: e.target.value === "" ? 0 : Number(e.target.value),
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pkg-length">Length (in)</Label>
          <Input
            id="pkg-length"
            type="number"
            min={0}
            step={0.1}
            disabled={disabled}
            value={pkg?.lengthInches ?? ""}
            placeholder="12"
            onChange={(e) =>
              patchPackage({
                lengthInches: e.target.value === "" ? 0 : Number(e.target.value),
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pkg-width">Width (in)</Label>
          <Input
            id="pkg-width"
            type="number"
            min={0}
            step={0.1}
            disabled={disabled}
            value={pkg?.widthInches ?? ""}
            placeholder="9"
            onChange={(e) =>
              patchPackage({
                widthInches: e.target.value === "" ? 0 : Number(e.target.value),
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pkg-height">Height (in)</Label>
          <Input
            id="pkg-height"
            type="number"
            min={0}
            step={0.1}
            disabled={disabled}
            value={pkg?.heightInches ?? ""}
            placeholder="1"
            onChange={(e) =>
              patchPackage({
                heightInches: e.target.value === "" ? 0 : Number(e.target.value),
              })
            }
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
          <Label htmlFor="preset-name">Save as preset</Label>
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
