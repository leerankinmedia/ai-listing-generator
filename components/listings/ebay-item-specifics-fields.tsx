"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown, ChevronRight } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  applyExactAspectsToListing,
  autoFillHighConfidenceAspects,
  countCompletedAspects,
  readAspectValue,
  resolveSelectValue,
  splitAspectFieldsForDisplay,
  validateAspectsAgainstOptions,
  writeAspectValue,
  type AspectFieldView,
  type EbayAspectFormField,
} from "@/lib/listings/ebay-aspect-fields"
import { enrichEbayTitleTowardLimit } from "@/lib/listings/ebay-title"
import type { Listing } from "@/lib/types"
import { cn } from "@/lib/utils"

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
      const value =
        options.length > 0
          ? resolveSelectValue(
              f.name,
              raw,
              options,
              f.suggestedValue || f.value
            )
          : raw
      return !value.trim()
    })
    .map((f) => f.name)
}

function StatusBadge({
  status,
}: {
  status: AspectFieldView["status"]
}) {
  if (status === "auto_filled") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
        Auto-filled
        <Check className="h-3 w-3" aria-hidden />
      </span>
    )
  }
  if (status === "needs_input" || status === "needs_review") {
    return (
      <span className="text-[11px] font-semibold uppercase tracking-wide text-destructive">
        Needs Review
      </span>
    )
  }
  return null
}

/** Editable control — only used when the seller must act. */
function AspectFieldEditor({
  view,
  listing,
  onChange,
  disabled,
}: {
  view: AspectFieldView
  listing: Listing
  onChange: (listing: Listing) => void
  disabled?: boolean
}) {
  const { field } = view
  const options = field.allowedValues || []
  const value = view.value

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`ebay-form-aspect-${field.name}`}>{field.name}</Label>
        <StatusBadge status={view.status} />
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

/** Compact read-only row for auto-filled values inside More. */
function AutoFilledRow({
  view,
  listing,
  onChange,
  disabled,
  editing,
  onEdit,
}: {
  view: AspectFieldView
  listing: Listing
  onChange: (listing: Listing) => void
  disabled?: boolean
  editing: boolean
  onEdit: () => void
}) {
  if (editing) {
    return (
      <AspectFieldEditor
        view={{ ...view, status: "needs_review" }}
        listing={listing}
        onChange={onChange}
        disabled={disabled}
      />
    )
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onEdit}
      className="flex w-full items-center justify-between gap-2 rounded-lg border border-transparent px-1 py-1.5 text-left hover:border-border hover:bg-card/60"
    >
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{view.field.name}</p>
        <p className="truncate text-sm font-medium">{view.value}</p>
      </div>
      <StatusBadge status="auto_filled" />
    </button>
  )
}

/**
 * One-minute listing UX: only ask for required fields AI cannot determine.
 * High-confidence (≥90%) values auto-select exact eBay options and collapse.
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
  const [editingNames, setEditingNames] = useState<Set<string>>(new Set())
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
          const exact = resolveSelectValue(
            f.name,
            raw,
            options,
            f.suggestedValue || f.value
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

        // ≥90% confidence → force exact eBay selection without user interaction.
        nextListing = autoFillHighConfidenceAspects(nextListing, formFields)

        const validated = validateAspectsAgainstOptions(nextListing, formFields)
        nextListing = validated.listing

        const suggested =
          json.suggestedTitle ||
          enrichEbayTitleTowardLimit(nextListing.title, nextListing)
        if (
          suggested &&
          suggested !== nextListing.title &&
          suggested.length <= 80
        ) {
          if (
            (suggested.length >= 70 && suggested.length <= 80) ||
            suggested.length > nextListing.title.length
          ) {
            nextListing = {
              ...nextListing,
              title: suggested,
              updatedAt: new Date().toISOString(),
            }
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
        Matching eBay item specifics…
      </p>
    )
  }

  if (error && fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {error} You can still edit core attributes below.
      </p>
    )
  }

  if (fields.length === 0) {
    return null
  }

  const { primary, more, autoFilledCount } = splitAspectFieldsForDisplay(
    fields,
    listing
  )
  const counts = countCompletedAspects(fields, listing)

  return (
    <div className="space-y-4">
      {primary.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Only fields AI couldn&apos;t determine with high confidence:
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {primary.map((view) => (
              <AspectFieldEditor
                key={view.field.name}
                view={view}
                listing={listing}
                onChange={onChange}
                disabled={disabled}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          All required item specifics were auto-filled from your photos.
        </p>
      )}

      {more.length > 0 && (
        <div className="rounded-xl border border-border bg-secondary/20">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
            onClick={() => setMoreOpen((o) => !o)}
          >
            <div className="flex items-start gap-2">
              {moreOpen ? (
                <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-semibold">More item specifics</p>
                <p className="text-xs text-muted-foreground">
                  {counts.completed} of {counts.total} completed
                  {autoFilledCount > 0
                    ? ` · ${autoFilledCount} auto-filled`
                    : ""}
                </p>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">
              {moreOpen ? "Hide" : "Show"}
            </span>
          </button>
          {moreOpen && (
            <div
              className={cn(
                "grid gap-2 border-t border-border p-3 sm:grid-cols-2"
              )}
            >
              {more.map((view) =>
                view.status === "auto_filled" ? (
                  <AutoFilledRow
                    key={view.field.name}
                    view={view}
                    listing={listing}
                    onChange={onChange}
                    disabled={disabled}
                    editing={editingNames.has(view.field.name)}
                    onEdit={() =>
                      setEditingNames((prev) => new Set(prev).add(view.field.name))
                    }
                  />
                ) : (
                  <AspectFieldEditor
                    key={view.field.name}
                    view={view}
                    listing={listing}
                    onChange={onChange}
                    disabled={disabled}
                  />
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
