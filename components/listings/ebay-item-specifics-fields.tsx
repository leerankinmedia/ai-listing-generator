"use client"

import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  applyExactAspectsToListing,
  countCompletedAspects,
  readAspectValue,
  resolveSelectValue,
  splitAspectFieldsForDisplay,
  validateAspectsAgainstOptions,
  writeAspectValue,
  type EbayAspectFormField,
} from "@/lib/listings/ebay-aspect-fields"
import { enrichEbayTitleTowardLimit } from "@/lib/listings/ebay-title"
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

function AspectFieldEditor({
  field,
  listing,
  onChange,
  disabled,
}: {
  field: EbayAspectFormField
  listing: Listing
  onChange: (listing: Listing) => void
  disabled?: boolean
}) {
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
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`ebay-form-aspect-${field.name}`}>{field.name}</Label>
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
}

/**
 * Required + SEO clothing item specifics in the main listing editor.
 * Primary fields stay visible; the rest collapse under “More item specifics.”
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
  const [moreOpen, setMoreOpen] = useState(false)
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
          seoCompleted?: number
          seoTotal?: number
          suggestedTitle?: string
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

        let nextListing = listing
        if (merged.length > 0 && applyKey !== appliedKeyRef.current) {
          appliedKeyRef.current = applyKey
          nextListing = applyExactAspectsToListing(
            listing,
            merged,
            optionsByName
          )
        }

        // Silently normalize any invalid selection-list values.
        const validated = validateAspectsAgainstOptions(nextListing, formFields)
        nextListing = validated.listing

        // SEO title 70–80 when enough accurate keywords are available.
        const suggested =
          json.suggestedTitle ||
          enrichEbayTitleTowardLimit(nextListing.title, nextListing)
        if (
          suggested &&
          suggested !== nextListing.title &&
          suggested.length >= 70 &&
          suggested.length <= 80
        ) {
          nextListing = {
            ...nextListing,
            title: suggested,
            updatedAt: new Date().toISOString(),
          }
        } else if (
          suggested &&
          suggested.length > nextListing.title.length &&
          suggested.length <= 80
        ) {
          nextListing = {
            ...nextListing,
            title: suggested,
            updatedAt: new Date().toISOString(),
          }
        }

        if (
          JSON.stringify(nextListing.specifics) !==
            JSON.stringify(listing.specifics) ||
          nextListing.title !== listing.title
        ) {
          onChangeRef.current(nextListing)
        }

        const counts = countCompletedAspects(formFields, nextListing)
        const missing =
          validated.missingRequired.length > 0
            ? validated.missingRequired
            : json.missingRequiredNames ||
              computeMissing(formFields, nextListing)

        onMetaChangeRef.current?.({
          missing,
          filled: counts.completed || json.seoCompleted || 0,
          total: counts.total || json.seoTotal || formFields.length,
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
    // Prefetch once per listing / category — title enrichment must not re-trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id, listing.specifics.category])

  useEffect(() => {
    if (fields.length === 0) return
    const validated = validateAspectsAgainstOptions(listing, fields)
    const counts = countCompletedAspects(fields, listing)
    onMetaChangeRef.current?.({
      missing:
        validated.missingRequired.length > 0
          ? validated.missingRequired
          : computeMissing(fields, listing),
      filled: counts.completed,
      total: counts.total,
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

  const { primary, more } = splitAspectFieldsForDisplay(fields, listing)
  const counts = countCompletedAspects(fields, listing)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {primary.map((field) => (
          <AspectFieldEditor
            key={field.name}
            field={field}
            listing={listing}
            onChange={onChange}
            disabled={disabled}
          />
        ))}
      </div>

      {more.length > 0 && (
        <div className="rounded-xl border border-border bg-secondary/20">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
            onClick={() => setMoreOpen((o) => !o)}
          >
            <div>
              <p className="text-sm font-semibold">More item specifics</p>
              <p className="text-xs text-muted-foreground">
                {counts.completed} of {counts.total} completed
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {moreOpen ? "Hide" : "Show"}
            </span>
          </button>
          {moreOpen && (
            <div className="grid gap-4 border-t border-border p-3 sm:grid-cols-2">
              {more.map((field) => (
                <AspectFieldEditor
                  key={field.name}
                  field={field}
                  listing={listing}
                  onChange={onChange}
                  disabled={disabled}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
