import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
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
    fieldConfidence: {},
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
  it("keeps primary SEO fields visible and collapses the rest", () => {
    const fields: EbayAspectFormField[] = [
      { name: "Brand", required: true, value: "Levi's", primary: true },
      { name: "Size", required: true, value: "32", primary: true },
      { name: "Style", required: false, value: "Straight", primary: true },
      { name: "Color", required: true, value: "Blue", primary: true },
      { name: "Department", required: true, value: "Men", primary: true },
      { name: "Type", required: false, value: "Jeans", primary: true },
      { name: "Pattern", required: false, value: "Solid" },
      { name: "Material", required: false, value: "Cotton" },
      { name: "Closure", required: false, value: "Zip" },
      { name: "Vintage", required: false },
    ]
    const listing = baseListing()
    const { primary, more } = splitAspectFieldsForDisplay(fields, listing)
    assert.ok(primary.some((f) => f.name === "Brand"))
    assert.ok(primary.some((f) => f.name === "Style"))
    assert.ok(more.some((f) => f.name === "Pattern"))
    assert.ok(more.some((f) => f.name === "Material"))
  })

  it("surfaces empty required fields on the main page even if not primary", () => {
    const fields: EbayAspectFormField[] = [
      { name: "Brand", required: true, value: "Levi's", primary: true },
      { name: "Theme", required: true },
      { name: "Pattern", required: false, value: "Solid" },
    ]
    const listing = baseListing({
      specifics: { brand: "Levi's", extras: { Brand: "Levi's", Pattern: "Solid" } },
    })
    const { primary, more } = splitAspectFieldsForDisplay(fields, listing)
    assert.ok(primary.some((f) => f.name === "Theme"))
    assert.ok(more.some((f) => f.name === "Pattern"))
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
    assert.equal(counts.total, 4)
    assert.ok(counts.completed >= 3)
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
