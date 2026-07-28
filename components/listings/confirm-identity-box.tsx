"use client"

import { useState } from "react"
import { Check, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  IDENTITY_CONFIRM_THRESHOLD,
  isKnownValue,
} from "@/lib/listings/clothing-identity"
import type { Listing } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Small confirm box when brand or character confidence is below 90%.
 * Avoids forcing the seller through the full eBay brand list.
 */
export function ConfirmIdentityBox({
  listing,
  onChange,
  disabled,
  className,
}: {
  listing: Listing
  onChange: (listing: Listing) => void
  disabled?: boolean
  className?: string
}) {
  const brandConf = listing.fieldConfidence?.brand
  const characterConf = listing.fieldConfidence?.character
  const brandValue =
    listing.specifics.brand || brandConf?.value || ""
  const characterValue =
    listing.specifics.extras?.Character || characterConf?.value || ""

  const brandNeeds =
    isKnownValue(brandValue) &&
    (brandConf?.confidence ?? 0) < IDENTITY_CONFIRM_THRESHOLD
  const characterNeeds =
    isKnownValue(characterValue) &&
    (characterConf?.confidence ?? 0) < IDENTITY_CONFIRM_THRESHOLD

  const [brand, setBrand] = useState(brandValue)
  const [character, setCharacter] = useState(characterValue)
  const [confirmed, setConfirmed] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  if (confirmed || dismissed || (!brandNeeds && !characterNeeds)) {
    return null
  }

  function applyConfirm() {
    const nextBrand = brand.trim()
    const nextCharacter = character.trim()
    const extras = { ...(listing.specifics.extras || {}) }
    if (nextCharacter) extras.Character = nextCharacter

    const fieldConfidence = { ...listing.fieldConfidence }
    if (nextBrand) {
      fieldConfidence.brand = {
        value: nextBrand,
        confidence: 1,
        rationale: "Confirmed by seller",
      }
    }
    if (nextCharacter) {
      fieldConfidence.character = {
        value: nextCharacter,
        confidence: 1,
        rationale: "Confirmed by seller",
      }
    }

    // Light title refresh: ensure brand/character appear when missing.
    let title = listing.title
    if (
      nextBrand &&
      !title.toLowerCase().includes(nextBrand.toLowerCase()) &&
      `${nextBrand} ${title}`.length <= 80
    ) {
      title = `${nextBrand} ${title}`.replace(/\s+/g, " ").trim().slice(0, 80)
    }
    if (
      nextCharacter &&
      !title.toLowerCase().includes(nextCharacter.toLowerCase())
    ) {
      const inserted = title.replace(
        new RegExp(`\\b(${escapeReg(nextBrand)})\\b`, "i"),
        `$1 ${nextCharacter}`
      )
      if (inserted !== title && inserted.length <= 80) {
        title = inserted
      } else if (`${title} ${nextCharacter}`.length <= 80) {
        title = `${title} ${nextCharacter}`.replace(/\s+/g, " ").trim()
      }
    }

    onChange({
      ...listing,
      title,
      specifics: {
        ...listing.specifics,
        brand: nextBrand || listing.specifics.brand,
        extras,
      },
      fieldConfidence,
      updatedAt: new Date().toISOString(),
    })
    setConfirmed(true)
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 shadow-sm",
        className
      )}
      role="region"
      aria-label="Confirm detected brand and character"
    >
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Confirm detected brand/character
            </p>
            <p className="text-xs text-muted-foreground">
              Vision is under 90% sure — quick confirm, no brand list search.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {brandNeeds && (
              <div className="space-y-1.5">
                <Label htmlFor="confirm-brand">Brand</Label>
                <Input
                  id="confirm-brand"
                  value={brand}
                  disabled={disabled}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="e.g. Looney Tunes"
                />
              </div>
            )}
            {(characterNeeds || isKnownValue(characterValue)) && (
              <div className="space-y-1.5">
                <Label htmlFor="confirm-character">Character</Label>
                <Input
                  id="confirm-character"
                  value={character}
                  disabled={disabled}
                  onChange={(e) => setCharacter(e.target.value)}
                  placeholder="e.g. Tweety Bird"
                />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={disabled}
              onClick={applyConfirm}
              className="gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              Confirm
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => setDismissed(true)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
