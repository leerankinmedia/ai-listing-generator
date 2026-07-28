"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown, ChevronRight, Sparkles } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  formatAiEmployeeBanner,
  readAspectValue,
  resolveSelectValue,
  splitAspectFieldsForDisplay,
  summarizeAiEmployeeAspects,
  validateAspectsAgainstOptions,
  writeAspectValue,
  type AspectFieldView,
  type AiEmployeeAspectSummary,
  type EbayAspectFormField,
} from "@/lib/listings/ebay-aspect-fields"
import { hydrateListingEbayAspects } from "@/lib/listings/hydrate-ebay-aspects"
import type { Listing } from "@/lib/types"
import { cn } from "@/lib/utils"

type AspectsMeta = {
  missing: string[]
  filled: number
  total: number
  needsAttention?: number
  banner?: string
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

function StatusBadge({ status }: { status: AspectFieldView["status"] }) {
  if (status === "auto_filled") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
        Auto-filled
        <Check className="h-3 w-3" aria-hidden />
      </span>
    )
  }
  if (status === "needs_review") {
    return (
      <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
        Review
      </span>
    )
  }
  if (status === "needs_input") {
    return (
      <span className="text-[11px] font-semibold uppercase tracking-wide text-destructive">
        Needs Review
      </span>
    )
  }
  return null
}

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

function AiEmployeeBanner({ summary }: { summary: AiEmployeeAspectSummary }) {
  const text = formatAiEmployeeBanner(summary)
  return (
    <div
      className="flex items-start gap-2.5 rounded-xl border border-accent/30 bg-accent/10 px-3.5 py-3"
      role="status"
    >
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
      <div>
        <p className="text-sm font-medium text-foreground">{text}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Brand, Style, and Size Type auto-select when AI can match eBay options.
          Size Type defaults to Regular.
        </p>
      </div>
    </div>
  )
}

/**
 * AI-employee item specifics: hydrate from Taxonomy, show attention-only fields.
 */
export function EbayItemSpecificsFields({
  listing,
  onChange,
  disabled,
  onMetaChange,
  /** When true, skip re-fetch (listing already hydrated before edit page). */
  skipHydrate,
  initialFields,
  initialSummary,
}: {
  listing: Listing
  onChange: (listing: Listing) => void
  disabled?: boolean
  onMetaChange?: (meta: AspectsMeta) => void
  skipHydrate?: boolean
  initialFields?: EbayAspectFormField[]
  initialSummary?: AiEmployeeAspectSummary
}) {
  const [fields, setFields] = useState<EbayAspectFormField[]>(
    initialFields || []
  )
  const [summary, setSummary] = useState<AiEmployeeAspectSummary>(
    initialSummary || {
      completed: 0,
      total: 0,
      needsAttention: 0,
      autoFilled: 0,
      review: 0,
    }
  )
  const [loading, setLoading] = useState(!initialFields?.length)
  const [error, setError] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [editingNames, setEditingNames] = useState<Set<string>>(new Set())
  const hydratedIdRef = useRef<string>("")
  const onMetaChangeRef = useRef(onMetaChange)
  const onChangeRef = useRef(onChange)
  onMetaChangeRef.current = onMetaChange
  onChangeRef.current = onChange

  useEffect(() => {
    if (skipHydrate && initialFields?.length) {
      setFields(initialFields)
      if (initialSummary) setSummary(initialSummary)
      setLoading(false)
      return
    }

    const hydrateKey = `${listing.id}:${listing.specifics.category || ""}`
    if (hydratedIdRef.current === hydrateKey && fields.length > 0) return

    let cancelled = false
    setLoading(true)
    setError(null)

    void hydrateListingEbayAspects(listing).then((result) => {
      if (cancelled) return
      hydratedIdRef.current = hydrateKey
      setFields(result.formFields)
      setSummary(result.summary)
      setLoading(false)

      if (!result.ok && result.skippedReason === "ebay_not_connected") {
        setFields([])
        onMetaChangeRef.current?.({ missing: [], filled: 0, total: 0 })
        return
      }
      if (!result.ok && result.formFields.length === 0) {
        setError("Could not load eBay item specifics.")
        return
      }

      if (
        JSON.stringify(result.listing.specifics) !==
          JSON.stringify(listing.specifics) ||
        result.listing.title !== listing.title
      ) {
        onChangeRef.current(result.listing)
      }

      onMetaChangeRef.current?.({
        missing: result.summary.needsAttention
          ? result.formFields
              .filter((f) => {
                if (!f.required) return false
                return !readAspectValue(result.listing, f.name).trim()
              })
              .map((f) => f.name)
          : [],
        filled: result.summary.completed,
        total: result.summary.total,
        needsAttention: result.summary.needsAttention,
        banner: formatAiEmployeeBanner(result.summary),
      })
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id, listing.specifics.category, skipHydrate])

  useEffect(() => {
    if (fields.length === 0) return
    const nextSummary = summarizeAiEmployeeAspects(fields, listing)
    setSummary(nextSummary)
    const validated = validateAspectsAgainstOptions(listing, fields)
    onMetaChangeRef.current?.({
      missing:
        validated.missingRequired.length > 0
          ? validated.missingRequired
          : computeMissing(fields, listing),
      filled: nextSummary.completed,
      total: nextSummary.total,
      needsAttention: nextSummary.needsAttention,
      banner: formatAiEmployeeBanner(nextSummary),
    })
  }, [listing, fields])

  if (loading && fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        AI is completing eBay item specifics…
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

  return (
    <div className="space-y-4">
      <AiEmployeeBanner summary={summary} />

      {primary.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Quick review — confirm or fix these, then publish:
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
          Nothing needs your attention — AI filled every required specific.
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
                  {summary.completed} of {summary.total} completed
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
            <div className={cn("grid gap-2 border-t border-border p-3 sm:grid-cols-2")}>
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
