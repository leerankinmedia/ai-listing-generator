import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  ASPECT_AUTO_FILL_CONFIDENCE,
  autoFillHighConfidenceAspects,
  classifyAspectField,
  countCompletedAspects,
  splitAspectFieldsForDisplay,
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
      brand: { value: "Levi's", confidence: 0.95 },
      style: { value: "straight-leg jeans", confidence: 0.94 },
      color: { value: "Blue", confidence: 0.96 },
      gender: { value: "Men", confidence: 0.93 },
      size: { value: "32", confidence: 0.91 },
      pattern: { value: "Solid", confidence: 0.92 },
      material: { value: "Cotton", confidence: 0.9 },
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

describe("splitAspectFieldsForDisplay", () => {
  it("only surfaces required fields that need user input on the main page", () => {
    const fields: EbayAspectFormField[] = [
      { name: "Brand", required: true, value: "Levi's", allowedValues: ["Levi's", "Nike"] },
      { name: "Size", required: true, value: "32" },
      { name: "Style", required: false, value: "Straight", allowedValues: ["Straight", "Skinny"] },
      { name: "Color", required: true, value: "Blue", allowedValues: ["Blue", "Black"] },
      { name: "Department", required: true, value: "Men", allowedValues: ["Men", "Women"] },
      { name: "Type", required: false, value: "Jeans" },
      { name: "Pattern", required: false, value: "Solid" },
      { name: "Material", required: false, value: "Cotton" },
      { name: "Theme", required: true },
      { name: "Vintage", required: false },
    ]
    const listing = baseListing()
    const { primary, more, autoFilledCount } = splitAspectFieldsForDisplay(
      fields,
      listing
    )
    assert.equal(primary.length, 1)
    assert.equal(primary[0]?.field.name, "Theme")
    assert.ok(autoFilledCount >= 7)
    assert.ok(more.every((v) => v.field.name !== "Vintage"))
    assert.ok(more.some((v) => v.field.name === "Brand"))
  })

  it("hides empty optional dropdowns entirely", () => {
    const fields: EbayAspectFormField[] = [
      { name: "Brand", required: true, value: "Levi's" },
      { name: "Inseam", required: false },
      { name: "Season", required: false },
    ]
    const { primary, more, hiddenBlankOptional } = splitAspectFieldsForDisplay(
      fields,
      baseListing()
    )
    assert.equal(primary.length, 0)
    assert.ok(!more.some((v) => v.field.name === "Inseam"))
    assert.ok(hiddenBlankOptional >= 2)
  })
})

describe("classifyAspectField", () => {
  it("marks filled values as auto_filled", () => {
    const view = classifyAspectField(
      { name: "Brand", required: true, value: "Levi's" },
      baseListing()
    )
    assert.equal(view.status, "auto_filled")
    assert.equal(view.value, "Levi's")
  })

  it("marks empty required as needs_input", () => {
    const view = classifyAspectField(
      { name: "Theme", required: true },
      baseListing({ specifics: { brand: "Levi's", extras: {} } })
    )
    assert.equal(view.status, "needs_input")
  })
})

describe("autoFillHighConfidenceAspects", () => {
  it("selects exact eBay options when confidence ≥ 90%", () => {
    assert.ok(ASPECT_AUTO_FILL_CONFIDENCE >= 0.9)
    const listing = baseListing({
      specifics: {
        brand: "Levi's",
        style: "straight-leg jeans",
        color: "Blue",
        extras: {},
      },
      fieldConfidence: {
        brand: { value: "Levi's", confidence: 0.95 },
        style: { value: "straight-leg jeans", confidence: 0.94 },
        color: { value: "Blue", confidence: 0.96 },
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
    assert.equal(next.specifics.style, "Straight")
    assert.equal(next.specifics.extras?.Color, "Blue")
  })

  it("does not auto-fill when confidence is below 90%", () => {
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

describe("countCompletedAspects", () => {
  it("reports completed of total for SEO collapse label", () => {
    const fields: EbayAspectFormField[] = [
      { name: "Brand", required: true, value: "Levi's" },
      { name: "Size", required: true, value: "32" },
      { name: "Style", required: false, value: "Straight" },
      { name: "Inseam", required: false },
    ]
    const counts = countCompletedAspects(fields, baseListing())
    assert.ok(counts.completed >= 3)
    assert.ok(counts.total >= 3)
  })
})

describe("validateAspectsAgainstOptions", () => {
  it("clears invalid selection values silently and keeps missing required", () => {
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
    assert.ok(!result.missingRequired.includes("Color"))
  })
})
