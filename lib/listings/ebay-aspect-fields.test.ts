import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  ASPECT_AUTO_FILL_CONFIDENCE,
  ASPECT_REVIEW_CONFIDENCE,
  autoFillHighConfidenceAspects,
  classifyAspectField,
  formatAiEmployeeBanner,
  splitAspectFieldsForDisplay,
  summarizeAiEmployeeAspects,
  validateAspectsAgainstOptions,
  type EbayAspectFormField,
} from "@/lib/listings/ebay-aspect-fields"
import type { Listing } from "@/lib/types"

function baseListing(partial: Partial<Listing> = {}): Listing {
  return {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    userId: "user1",
    title: "Levi's Men's 32 Blue Straight Jeans",
    description: "Jeans",
    price: 28,
    currency: "USD",
    keywords: [],
    specifics: {
      brand: "Levi's",
      size: "32",
      color: "Blue",
      style: "Straight",
      gender: "Men",
      extras: {
        Brand: "Levi's",
        Style: "Straight",
        Color: "Blue",
        Department: "Men",
        Type: "Jeans",
        Pattern: "Solid",
        Material: "Cotton",
      },
    },
    fieldConfidence: {
      brand: { value: "Levi's", confidence: 0.97 },
      style: { value: "straight-leg jeans", confidence: 0.96 },
      color: { value: "Blue", confidence: 0.98 },
      gender: { value: "Men", confidence: 0.96 },
      size: { value: "32", confidence: 0.97 },
      pattern: { value: "Solid", confidence: 0.8 },
      material: { value: "Cotton", confidence: 0.82 },
    },
    images: [],
    status: "draft",
    marketplaceListings: [],
    targetMarketplaces: ["ebay"],
    aiGenerated: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  }
}

describe("confidence tiers", () => {
  it("uses 95% auto-fill and 70% review thresholds", () => {
    assert.equal(ASPECT_AUTO_FILL_CONFIDENCE, 0.95)
    assert.equal(ASPECT_REVIEW_CONFIDENCE, 0.7)
  })
})

describe("classifyAspectField tiers", () => {
  it("marks ≥95% filled values as auto_filled", () => {
    const view = classifyAspectField(
      { name: "Brand", required: true, value: "Levi's" },
      baseListing()
    )
    assert.equal(view.status, "auto_filled")
  })

  it("marks 70–94% filled values as needs_review", () => {
    const view = classifyAspectField(
      { name: "Pattern", required: false, value: "Solid" },
      baseListing()
    )
    assert.equal(view.status, "needs_review")
    assert.ok((view.confidence || 0) >= 0.7)
    assert.ok((view.confidence || 0) < 0.95)
  })

  it("marks empty required as needs_input", () => {
    const view = classifyAspectField(
      { name: "Theme", required: true },
      baseListing({ specifics: { brand: "Levi's", extras: {} } })
    )
    assert.equal(view.status, "needs_input")
  })
})

describe("splitAspectFieldsForDisplay", () => {
  it("puts Review + blank required on the main page; auto-filled in More", () => {
    const fields: EbayAspectFormField[] = [
      { name: "Brand", required: true, value: "Levi's" },
      { name: "Color", required: true, value: "Blue" },
      { name: "Pattern", required: false, value: "Solid" },
      { name: "Material", required: false, value: "Cotton" },
      { name: "Theme", required: true },
      { name: "Inseam", required: false },
    ]
    const { primary, more, autoFilledCount, reviewCount } =
      splitAspectFieldsForDisplay(fields, baseListing())
    assert.ok(primary.some((v) => v.field.name === "Theme"))
    assert.ok(primary.some((v) => v.field.name === "Pattern"))
    assert.ok(primary.some((v) => v.field.name === "Material"))
    assert.ok(more.some((v) => v.field.name === "Brand"))
    assert.ok(autoFilledCount >= 2)
    assert.ok(reviewCount >= 2)
    assert.ok(!more.some((v) => v.field.name === "Inseam"))
  })
})

describe("autoFillHighConfidenceAspects", () => {
  it("auto-selects at ≥95%", () => {
    const listing = baseListing({
      specifics: {
        brand: "Levi's",
        style: "straight-leg jeans",
        color: "Blue",
        extras: {},
      },
      fieldConfidence: {
        brand: { value: "Levi's", confidence: 0.97 },
        style: { value: "straight-leg jeans", confidence: 0.96 },
        color: { value: "Blue", confidence: 0.98 },
      },
    })
    const fields: EbayAspectFormField[] = [
      {
        name: "Brand",
        required: true,
        allowedValues: ["Levi's", "Nike", "Unbranded"],
      },
      {
        name: "Style",
        required: true,
        allowedValues: ["Skinny", "Straight", "Bootcut"],
      },
      {
        name: "Color",
        required: true,
        allowedValues: ["Black", "Blue", "Gray"],
      },
    ]
    const next = autoFillHighConfidenceAspects(listing, fields)
    assert.equal(next.specifics.extras?.Brand, "Levi's")
    assert.equal(next.specifics.extras?.Style, "Straight")
    assert.equal(next.specifics.extras?.Color, "Blue")
  })

  it("preselects at 70–94% for Review", () => {
    const listing = baseListing({
      specifics: { pattern: "Solid", extras: {} },
      fieldConfidence: {
        pattern: { value: "Solid", confidence: 0.8 },
      },
    })
    const fields: EbayAspectFormField[] = [
      {
        name: "Pattern",
        required: false,
        allowedValues: ["Solid", "Striped", "Plaid"],
      },
    ]
    const next = autoFillHighConfidenceAspects(listing, fields)
    assert.equal(next.specifics.extras?.Pattern, "Solid")
    const view = classifyAspectField(fields[0], next)
    assert.equal(view.status, "needs_review")
  })

  it("leaves blank under 70%", () => {
    const listing = baseListing({
      specifics: { style: "maybe skinny", extras: {} },
      fieldConfidence: {
        style: { value: "maybe skinny", confidence: 0.55 },
      },
    })
    const fields: EbayAspectFormField[] = [
      {
        name: "Style",
        required: true,
        allowedValues: ["Skinny", "Straight", "Bootcut"],
      },
    ]
    const next = autoFillHighConfidenceAspects(listing, fields)
    assert.equal(next.specifics.extras?.Style, undefined)
  })
})

describe("AI employee banner", () => {
  it("formats completed / attention copy", () => {
    const fields: EbayAspectFormField[] = [
      { name: "Brand", required: true, value: "Levi's" },
      { name: "Color", required: true, value: "Blue" },
      { name: "Pattern", required: false, value: "Solid" },
      { name: "Theme", required: true },
    ]
    const summary = summarizeAiEmployeeAspects(fields, baseListing())
    const banner = formatAiEmployeeBanner(summary)
    assert.match(banner, /AI completed \d+\/\d+ item specifics/)
    assert.match(banner, /need your attention|Ready to publish/)
    assert.ok(summary.needsAttention >= 1)
  })
})

describe("validateAspectsAgainstOptions", () => {
  it("clears invalid selection values silently", () => {
    const listing = baseListing({
      specifics: {
        brand: "Levi's",
        extras: {
          Brand: "Levi's",
          Style: "straight-leg jeans",
          Color: "Blue",
        },
      },
    })
    const fields: EbayAspectFormField[] = [
      {
        name: "Style",
        required: true,
        allowedValues: ["Skinny", "Straight", "Bootcut"],
      },
      {
        name: "Color",
        required: true,
        allowedValues: ["Black", "Blue", "Gray"],
        value: "Blue",
      },
    ]
    const result = validateAspectsAgainstOptions(listing, fields)
    assert.ok(result.cleared.includes("Style"))
    assert.ok(result.missingRequired.includes("Style"))
  })
})
