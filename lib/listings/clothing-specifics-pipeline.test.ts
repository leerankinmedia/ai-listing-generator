import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { mapDraftToListingFields } from "@/lib/listings/map-draft"
import { identityExtrasFromFields } from "@/lib/listings/clothing-identity"
import type { IdentityFields } from "@/lib/listings/clothing-identity"
import type { GeneratedListingOutput } from "@/lib/listings/schema"
import { applyRequiredEbayAspects } from "@/lib/marketplaces/adapters/ebay/aspects"
import { mapListingToEbayInventory } from "@/lib/marketplaces/adapters/ebay/client"
import type { EbayAspect } from "@/lib/marketplaces/adapters/ebay/aspects"
import type { FieldConfidence, Listing } from "@/lib/types"

function fc(value: string, confidence: number, rationale = "tag"): FieldConfidence {
  return { value, confidence, rationale }
}

function jeansDraft(): GeneratedListingOutput {
  return {
    title: "American Eagle Men's 32x30 Blue Straight Jeans",
    description: "Pre-owned AE jeans",
    price: 28,
    currency: "USD",
    keywords: ["american eagle", "jeans"],
    specifics: {
      brand: "American Eagle",
      size: "32x30",
      color: "Blue",
      material: "Cotton",
      style: "Straight",
      pattern: "Solid",
      gender: "Men",
      condition: "Good",
      category: "Clothing, Shoes & Accessories > Men > Men's Clothing > Jeans",
      flaws: "None visible",
      extras: {
        Type: "Jeans",
        Features: "5-pocket",
        "Waist Size": "32",
        Inseam: "30",
        Fit: "Regular",
        Rise: "Mid",
        Closure: "Zip",
        "Fabric Wash": "Medium Wash",
        "Pocket Type": "5-Pocket",
        "Fabric Type": "Denim",
        "Garment Care": "Machine Wash",
        "Size Type": "Regular",
        Accents: "Whiskering",
        "Product Line": "AE Ne(X)t Level",
        "Style Number": "0118-2341",
      },
    },
    fieldConfidence: {
      brand: fc("American Eagle", 0.97),
      size: fc("32x30", 0.96, "Size tag"),
      color: fc("Blue", 0.95),
      material: fc("Cotton", 0.93, "Care tag"),
      style: fc("Straight", 0.9),
      gender: fc("Men", 0.96),
      waistSize: fc("32", 0.96, "Size tag 32x30"),
      inseam: fc("30", 0.96, "Size tag 32x30"),
      fit: fc("Regular", 0.88),
      rise: fc("Mid", 0.86),
      closure: fc("Zip", 0.92, "Visible zipper"),
      fabricWash: fc("Medium Wash", 0.9),
      pocketType: fc("5-Pocket", 0.91),
      fabricType: fc("Denim", 0.94),
      garmentCare: fc("Machine Wash", 0.9, "Care tag"),
      sizeType: fc("Regular", 0.85),
      accents: fc("Whiskering", 0.84),
      productLine: fc("AE Ne(X)t Level", 0.9, "Tag"),
      styleNumber: fc("0118-2341", 0.94, "Style number on tag"),
      mpn: fc("Unknown", 0.2, "No MPN label"),
      upc: fc("Unknown", 0.1, "No barcode"),
    },
    comps: {
      suggestedPrice: 28,
      lowPrice: 20,
      highPrice: 35,
      currency: "USD",
      confidence: 0.7,
      method: "ai_market_comps",
      rationale: "test",
      comparableSummary: "test",
      sampleSize: 4,
    },
    perImage: [],
  }
}

function jeansListing(): Listing {
  const mapped = mapDraftToListingFields(jeansDraft())
  return {
    id: "lst-jeans",
    userId: "user-1",
    title: mapped.title,
    description: mapped.description,
    price: mapped.price,
    currency: mapped.currency,
    keywords: mapped.keywords,
    specifics: {
      ...mapped.specifics,
      shippingMode: "calculated",
      shippingService: "USPSGroundAdvantage",
      handlingTimeDays: 1,
      itemLocationZip: "43604",
      extras: {
        ...mapped.specifics.extras,
        itemLocationZip: "43604",
        quantity: "1",
        minOfferAmount: "15",
      },
    },
    fieldConfidence: mapped.fieldConfidence,
    images: [],
    status: "draft",
    marketplaceListings: [],
    targetMarketplaces: ["ebay"],
    aiGenerated: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

function aspect(
  name: string,
  opts: { required?: boolean; values?: string[]; mode?: string } = {}
): EbayAspect {
  return {
    localizedAspectName: name,
    aspectConstraint: {
      aspectRequired: Boolean(opts.required),
      aspectMode: opts.mode || (opts.values ? "SELECTION_ONLY" : "FREE_TEXT"),
    },
    aspectValues: (opts.values || []).map((localizedValue) => ({ localizedValue })),
  }
}

describe("clothing listing specifics pipeline", () => {
  it("persists many generated jeans specifics through mapDraft", () => {
    const mapped = mapDraftToListingFields(jeansDraft())
    const extras = mapped.specifics.extras || {}
    assert.equal(mapped.specifics.brand, "American Eagle")
    assert.equal(extras["Waist Size"], "32")
    assert.equal(extras.Inseam, "30")
    assert.equal(extras.Fit, "Regular")
    assert.equal(extras.Rise, "Mid")
    assert.equal(extras.Closure, "Zip")
    assert.equal(extras["Fabric Wash"], "Medium Wash")
    assert.equal(extras["Pocket Type"], "5-Pocket")
    assert.equal(extras["Fabric Type"], "Denim")
    assert.equal(extras["Garment Care"], "Machine Wash")
    assert.equal(extras["Size Type"], "Regular")
    assert.equal(extras.Accents, "Whiskering")
    assert.equal(extras["Product Line"], "AE Ne(X)t Level")
    assert.equal(extras["Style Number"], "0118-2341")
    assert.equal(extras.MPN, undefined)
    assert.equal(extras.UPC, undefined)
  })

  it("strips a hallucinated MPN from generated extras during persistence", () => {
    const draft = jeansDraft()
    draft.specifics.extras = {
      ...draft.specifics.extras,
      MPN: "AEJEANS32",
    }
    draft.fieldConfidence.mpn = fc("AEJEANS32", 0.4, "Probably the style")
    const mapped = mapDraftToListingFields(draft)
    assert.equal(mapped.specifics.extras?.MPN, undefined)
    assert.equal(mapped.specifics.extras?.["Style Number"], "0118-2341")
  })

  it("does not promote a style number into MPN extras", () => {
    const fields = {
      brand: fc("American Eagle", 0.97),
      category: fc("Jeans", 0.9),
      size: fc("32x30", 0.96),
      color: fc("Blue", 0.95),
      material: fc("Cotton", 0.9),
      style: fc("Straight", 0.9),
      pattern: fc("Solid", 0.8),
      gender: fc("Men", 0.96),
      condition: fc("Good", 0.8),
      flaws: fc("None visible", 0.9),
      character: fc("Unknown", 0.1),
      theme: fc("Unknown", 0.1),
      features: fc("5-pocket", 0.9),
      itemType: fc("Jeans", 0.9),
      licensedProperty: fc("Unknown", 0.1),
      styleNumber: fc("0118-2341", 0.95, "Style number on tag"),
      countryOfOrigin: fc("Unknown", 0.2),
      waistSize: fc("32", 0.96),
      inseam: fc("30", 0.96),
      fit: fc("Regular", 0.88),
      rise: fc("Mid", 0.86),
      closure: fc("Zip", 0.9),
      fabricWash: fc("Medium Wash", 0.9),
      pocketType: fc("5-Pocket", 0.9),
      fabricType: fc("Denim", 0.94),
      garmentCare: fc("Unknown", 0.2),
      sizeType: fc("Regular", 0.85),
      season: fc("Unknown", 0.1),
      accents: fc("Unknown", 0.2),
      model: fc("Unknown", 0.1),
      productLine: fc("Unknown", 0.2),
      mpn: fc("0118-2341", 0.6, "Guessed from style number"),
      upc: fc("Unknown", 0.1),
    } satisfies IdentityFields
    const extras = identityExtrasFromFields(fields)
    assert.equal(extras["Style Number"], "0118-2341")
    assert.equal(extras.MPN, undefined)
  })

  it("fills required eBay clothing aspects from generated extras", () => {
    const listing = jeansListing()
    const taxonomy: EbayAspect[] = [
      aspect("Brand", { required: true, values: ["American Eagle", "Levi's"] }),
      aspect("Size Type", { required: true, values: ["Regular", "Petite", "Tall"] }),
      aspect("Size", { required: true }),
      aspect("Department", { required: true, values: ["Men", "Women"] }),
      aspect("Color", { required: true, values: ["Blue", "Black"] }),
      aspect("Style", { required: true, values: ["Straight", "Skinny", "Bootcut"] }),
    ]
    const { inventoryItem } = mapListingToEbayInventory(listing)
    const applied = applyRequiredEbayAspects(
      listing,
      taxonomy,
      inventoryItem.product.aspects
    )
    assert.deepEqual(applied.missingRequired, [])
    assert.equal(applied.aspects.Brand?.[0], "American Eagle")
    assert.equal(applied.aspects.Style?.[0], "Straight")
    assert.equal(applied.aspects["Size Type"]?.[0], "Regular")
    assert.equal(applied.aspects.Department?.[0], "Men")
    assert.equal(applied.aspects.Color?.[0], "Blue")
  })

  it("maps generated extras onto inventory aspects and skips operational extras", () => {
    const listing = jeansListing()
    const { inventoryItem } = mapListingToEbayInventory(listing)
    const aspects = inventoryItem.product.aspects
    assert.equal(aspects["Waist Size"]?.[0], "32")
    assert.equal(aspects.Fit?.[0], "Regular")
    assert.equal(aspects.Rise?.[0], "Mid")
    assert.equal(aspects.Closure?.[0], "Zip")
    assert.equal(aspects["Fabric Wash"]?.[0], "Medium Wash")
    assert.equal(aspects.itemLocationZip, undefined)
    assert.equal(aspects.minOfferAmount, undefined)
    assert.equal(aspects.quantity, undefined)
    assert.equal(aspects.MPN, undefined)
  })

  it("uses Does not apply for required MPN when none is verified", () => {
    const listing = jeansListing()
    const taxonomy: EbayAspect[] = [
      aspect("Brand", { required: true, values: ["American Eagle"] }),
      aspect("MPN", { required: true, values: ["Does not apply"] }),
    ]
    const applied = applyRequiredEbayAspects(listing, taxonomy, {
      Brand: ["American Eagle"],
    })
    assert.equal(applied.aspects.MPN?.[0], "Does not apply")
    assert.equal(
      applied.missingRequired.some((f) => f.name === "MPN"),
      false
    )
  })

  it("never copies a style number into a required MPN aspect", () => {
    const listing = jeansListing()
    listing.specifics.extras = {
      ...listing.specifics.extras,
      MPN: "0118-2341",
    }
    listing.fieldConfidence = {
      ...listing.fieldConfidence,
      mpn: fc("0118-2341", 0.5, "Inferred from style number"),
      styleNumber: fc("0118-2341", 0.95, "Style number on tag"),
    }
    const taxonomy: EbayAspect[] = [
      aspect("MPN", { required: true, values: ["Does not apply"] }),
    ]
    const applied = applyRequiredEbayAspects(listing, taxonomy, {})
    assert.equal(applied.aspects.MPN?.[0], "Does not apply")
  })
})
