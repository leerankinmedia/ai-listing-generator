import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  autoFillHighConfidenceAspects,
  classifyAspectField,
  formatAiEmployeeBanner,
  resolveMustFillAspectValue,
  splitAspectFieldsForDisplay,
  summarizeAiEmployeeAspects,
  type EbayAspectFormField,
} from "@/lib/listings/ebay-aspect-fields"
import {
  matchBrandToEbayList,
  matchStyleToEbayList,
  resolveSizeTypeFromText,
  stringSimilarity,
} from "@/lib/marketplaces/adapters/ebay/aspect-normalize"
import type { Listing } from "@/lib/types"

function baseListing(partial: Partial<Listing> = {}): Listing {
  return {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    userId: "user1",
    title: "Levi's Men's 32 Blue Straight Jeans",
    description: "Straight leg denim jeans",
    price: 28,
    currency: "USD",
    keywords: [],
    specifics: {
      brand: "Levi's",
      size: "32",
      color: "Blue",
      style: "straight-leg jeans",
      gender: "Men",
      extras: {},
    },
    fieldConfidence: {
      brand: { value: "Levi's", confidence: 0.92 },
      style: { value: "straight-leg jeans", confidence: 0.88 },
      color: { value: "Blue", confidence: 0.97 },
      gender: { value: "Men", confidence: 0.96 },
      size: { value: "32", confidence: 0.9 },
      pattern: { value: "Solid", confidence: 0.8 },
      material: { value: "Cotton", confidence: 0.85 },
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

describe("brand fuzzy matching", () => {
  it("scores exact brands at 1.0", () => {
    assert.equal(stringSimilarity("Levi's", "Levi's"), 1)
  })

  it("auto-selects when fuzzy score ≥ 95%", () => {
    const brands = ["Nike", "Levi's", "Adidas", "Unbranded", "Levi Strauss & Co."]
    const hit = matchBrandToEbayList("Levis", brands)
    assert.ok(hit.score >= 0.95, `score was ${hit.score}`)
    assert.ok(hit.value === "Levi's" || hit.value?.includes("Levi"))
  })

  it("selects Levi's from OCR-ish Levi's wording", () => {
    const hit = matchBrandToEbayList("Levi's", [
      "Nike",
      "Levi's",
      "Lee",
      "Wrangler",
    ])
    assert.equal(hit.value, "Levi's")
    assert.ok(hit.score >= 0.95)
  })
})

describe("style closest match", () => {
  it("maps straight-leg jeans → Straight", () => {
    assert.equal(
      matchStyleToEbayList("straight-leg jeans", [
        "Skinny",
        "Straight",
        "Flared",
        "Bootcut",
      ]),
      "Straight"
    )
  })

  it("maps flared leg → Flared", () => {
    assert.equal(
      matchStyleToEbayList("flared leg", ["Skinny", "Straight", "Flared"]),
      "Flared"
    )
  })
})

describe("size type Regular default", () => {
  it("defaults to Regular when tag has no special type", () => {
    assert.equal(
      resolveSizeTypeFromText("Men's 32x32 denim", [
        "Petite",
        "Regular",
        "Tall",
        "Plus",
      ]),
      "Regular"
    )
  })

  it("picks Petite when tag says Petite", () => {
    assert.equal(
      resolveSizeTypeFromText("Women's Petite 6", [
        "Petite",
        "Regular",
        "Plus",
      ]),
      "Petite"
    )
  })
})

describe("must-fill Brand Style Size Type", () => {
  it("never leaves Brand/Style/Size Type blank when determinable", () => {
    const listing = baseListing()
    const brand = resolveMustFillAspectValue("Brand", listing, [
      "Nike",
      "Levi's",
      "Lee",
    ])
    const style = resolveMustFillAspectValue("Style", listing, [
      "Skinny",
      "Straight",
      "Flared",
    ])
    const sizeType = resolveMustFillAspectValue("Size Type", listing, [
      "Petite",
      "Regular",
      "Plus",
      "Juniors",
      "Maternity",
    ])
    assert.equal(brand, "Levi's")
    assert.equal(style, "Straight")
    assert.equal(sizeType, "Regular")
  })
})

describe("autoFill opens with zero required when fillable", () => {
  it("auto-selects Brand Style Size Type Color Department even under 95% confidence", () => {
    const listing = baseListing()
    const fields: EbayAspectFormField[] = [
      {
        name: "Brand",
        required: true,
        allowedValues: ["Nike", "Levi's", "Lee", "Unbranded"],
      },
      {
        name: "Style",
        required: true,
        allowedValues: ["Skinny", "Straight", "Flared", "Bootcut"],
      },
      {
        name: "Size Type",
        required: true,
        allowedValues: ["Petite", "Regular", "Tall", "Plus", "Juniors", "Maternity"],
      },
      {
        name: "Color",
        required: true,
        allowedValues: ["Black", "Blue", "Gray"],
      },
      {
        name: "Department",
        required: true,
        allowedValues: ["Men", "Women", "Unisex"],
      },
      {
        name: "Size",
        required: true,
        allowedValues: ["30", "32", "34"],
      },
    ]
    const next = autoFillHighConfidenceAspects(listing, fields)
    assert.equal(next.specifics.extras?.Brand, "Levi's")
    assert.equal(next.specifics.extras?.Style, "Straight")
    assert.equal(next.specifics.extras?.["Size Type"], "Regular")
    assert.equal(next.specifics.extras?.Color, "Blue")
    assert.equal(next.specifics.extras?.Department || next.specifics.gender, "Men")
    assert.equal(next.specifics.extras?.Size || next.specifics.size, "32")

    const { primary } = splitAspectFieldsForDisplay(fields, next)
    assert.equal(
      primary.length,
      0,
      `expected 0 required attention fields, got ${primary.map((p) => p.field.name).join(", ")}`
    )
  })

  it("treats filled dropdown matches as auto_filled not Review", () => {
    const listing = baseListing({
      specifics: {
        brand: "Levi's",
        extras: { Brand: "Levi's", Pattern: "Solid" },
      },
      fieldConfidence: {
        brand: { value: "Levi's", confidence: 0.8 },
        pattern: { value: "Solid", confidence: 0.8 },
      },
    })
    const brandView = classifyAspectField(
      {
        name: "Brand",
        required: true,
        allowedValues: ["Levi's", "Nike"],
        value: "Levi's",
      },
      listing
    )
    assert.equal(brandView.status, "auto_filled")
  })
})

describe("AI employee banner", () => {
  it("reports ready when nothing needs attention", () => {
    const listing = baseListing({
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
          Size: "32",
          "Size Type": "Regular",
        },
      },
    })
    const fields: EbayAspectFormField[] = [
      { name: "Brand", required: true, allowedValues: ["Levi's"], value: "Levi's" },
      { name: "Style", required: true, allowedValues: ["Straight"], value: "Straight" },
      {
        name: "Size Type",
        required: true,
        allowedValues: ["Regular"],
        value: "Regular",
      },
    ]
    const filled = autoFillHighConfidenceAspects(listing, fields)
    const summary = summarizeAiEmployeeAspects(fields, filled)
    assert.equal(summary.needsAttention, 0)
    assert.match(formatAiEmployeeBanner(summary), /Ready to publish/)
  })
})
