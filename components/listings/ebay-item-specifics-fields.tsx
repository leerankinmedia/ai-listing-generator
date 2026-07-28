"use client"

import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  applyExactAspectsToListing,
  readAspectValue,
  resolveSelectValue,
  writeAspectValue,
  type EbayAspectFormField,
} from "@/lib/listings/ebay-aspect-fields"
import type { Listing } from "@/lib/types"

type AspectsMeta = {
  missing: string[]
  filled: number
  total: number
}

function computeMissing(
  fields: EbayAspectFormField[],
  listing: Listing
): string[] {
  return fields
    .filter((f) => {
      if (!f.required) return false
      const raw = readAspectValue(listing, f.name)
      const options = f.allowedValues || []
      const nameKey = f.name.trim().toLowerCase()
      const detected =
        nameKey === "color" || nameKey === "colour"
          ? listing.fieldConfidence?.color?.value
          : nameKey === "style"
            ? listing.fieldConfidence?.style?.value || listing.specifics.style
            : undefined
      const value =
        options.length > 0
          ? resolveSelectValue(
              f.name,
              raw,
              options,
              f.suggestedValue || f.value,
              detected
            )
          : raw
      return !value.trim()
    })
    .map((f) => f.name)
}

/**
 * Required + priority eBay item specifics in the main listing editor.
 * Shows red Required labels immediately — does not wait for Publish.
 */
export function EbayItemSpecificsFields({
  listing,
  onChange,
  disabled,
  onMetaChange,
}: {
  listing: Listing
  onChange: (listing: Listing) => void
  disabled?: boolean
  onMetaChange?: (meta: AspectsMeta) => void
}) {
  const [fields, setFields] = useState<EbayAspectFormField[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const appliedKeyRef = useRef<string>("")
  const onMetaChangeRef = useRef(onMetaChange)
  const onChangeRef = useRef(onChange)
  onMetaChangeRef.current = onMetaChange
  onChangeRef.current = onChange

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    void fetch("/api/marketplaces/ebay/aspects-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listing }),
    })
      .then(async (res) => {
        if (cancelled) return
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as {
            error?: string
            code?: string
          }
          if (json.code === "ebay_not_connected") {
            setFields([])
            onMetaChangeRef.current?.({ missing: [], filled: 0, total: 0 })
            return
          }
          setError(json.error || "Could not load eBay item specifics.")
          return
        }
        const json = (await res.json()) as {
          formFields?: EbayAspectFormField[]
          resolvedFields?: Array<{ name: string; value: string }>
          missingRequiredNames?: string[]
          aspectFilledCount?: number
          aspectTotalCount?: number
        }
        const formFields = json.formFields || []
        setFields(formFields)

        const optionsByName = new Map<string, string[]>()
        for (const field of formFields) {
          if (field.allowedValues?.length) {
            optionsByName.set(field.name.toLowerCase(), field.allowedValues)
          }
        }

        const fromResolved = json.resolvedFields || []
        const fromSuggested = formFields
          .filter((f) => f.suggestedValue || f.value)
          .map((f) => ({
            name: f.name,
            value: (f.value || f.suggestedValue || "").trim(),
          }))
          .filter((f) => f.value)

        // Prefill exact eBay options from AI wording (e.g. Style → Straight).
        const fromNormalized = formFields.flatMap((f) => {
          const options = f.allowedValues || []
          if (options.length === 0) return []
          const raw = readAspectValue(listing, f.name)
          const detected =
            f.name.trim().toLowerCase() === "color" ||
            f.name.trim().toLowerCase() === "colour"
              ? listing.fieldConfidence?.color?.value
              : f.name.trim().toLowerCase() === "style"
                ? listing.fieldConfidence?.style?.value ||
                  listing.specifics.style
                : undefined
          const exact = resolveSelectValue(
            f.name,
            raw,
            options,
            f.suggestedValue || f.value,
            detected
          )
          return exact ? [{ name: f.name, value: exact }] : []
        })

        const merged = [...fromResolved, ...fromSuggested, ...fromNormalized]
        const applyKey = JSON.stringify(
          merged.map((m) => `${m.name}=${m.value}`).sort()
        )
        if (merged.length > 0 && applyKey !== appliedKeyRef.current) {
          appliedKeyRef.current = applyKey
          const next = applyExactAspectsToListing(
            listing,
            merged,
            optionsByName
          )
          if (
            JSON.stringify(next.specifics) !== JSON.stringify(listing.specifics)
          ) {
            onChangeRef.current(next)
          }
        }

        const missing =
          json.missingRequiredNames || computeMissing(formFields, listing)

        onMetaChangeRef.current?.({
          missing,
          filled: json.aspectFilledCount || 0,
          total: Math.max(json.aspectTotalCount || 0, formFields.length),
        })
      })
      .catch(() => {
        if (!cancelled) setError("Could not load eBay item specifics.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // Prefetch once per listing id / category text — avoid loop on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id, listing.specifics.category, listing.title])

  // Keep missing list fresh as the seller edits fields.
  useEffect(() => {
    if (fields.length === 0) return
    const missing = computeMissing(fields, listing)
    onMetaChangeRef.current?.({
      missing,
      filled: fields.filter((f) => {
        const raw = readAspectValue(listing, f.name)
        return Boolean(raw.trim() || f.value)
      }).length,
      total: fields.length,
    })
  }, [listing, fields])

  if (loading && fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Loading eBay item specifics…
      </p>
    )
  }

  if (error && fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {error} You can still edit Brand, Size, Color, and Style below.
      </p>
    )
  }

  if (fields.length === 0) {
    return null
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const options = field.allowedValues || []
        const raw = readAspectValue(listing, field.name)
        const nameKey = field.name.trim().toLowerCase()
        const detected =
          nameKey === "color" || nameKey === "colour"
            ? listing.fieldConfidence?.color?.value
            : nameKey === "style"
              ? listing.fieldConfidence?.style?.value || listing.specifics.style
              : undefined
        const value =
          options.length > 0
            ? resolveSelectValue(
                field.name,
                raw,
                options,
                field.suggestedValue || field.value,
                detected
              )
            : raw
        const empty = !value.trim()
        const showRequired = field.required && empty

        return (
          <div key={field.name} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`ebay-form-aspect-${field.name}`}>
                {field.name}
              </Label>
              {showRequired ? (
                <span className="text-[11px] font-semibold uppercase tracking-wide text-destructive">
                  Required
                </span>
              ) : field.required ? (
                <span className="text-[11px] text-muted-foreground">Required</span>
              ) : null}
            </div>
            {options.length > 0 ? (
              <select
                id={`ebay-form-aspect-${field.name}`}
                value={value}
                disabled={disabled}
                onChange={(e) =>
                  onChange(writeAspectValue(listing, field.name, e.target.value))
                }
                className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select {field.name}</option>
                {options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={`ebay-form-aspect-${field.name}`}
                value={value}
                disabled={disabled}
                onChange={(e) =>
                  onChange(writeAspectValue(listing, field.name, e.target.value))
                }
                placeholder={`Enter ${field.name}`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
