import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { ImageDetection } from "@/lib/listings/schema"
import {
  applyLicensedBrandFallback,
  identityExtrasFromFields,
  mergeClothingDetections,
  mergeIdentitySecondPass,
  needsBrandCharacterConfirm,
  needsIdentitySecondPass,
  pickBestPreferTag,
} from "@/lib/listings/clothing-identity"
import {
  buildEbayOptimizedTitle,
  enrichEbayTitleTowardLimit,
} from "@/lib/listings/ebay-title"
import { mapDraftToListingFields } from "@/lib/listings/map-draft"
import type { GeneratedListingOutput } from "@/lib/listings/schema"
import type { Listing } from "@/lib/types"

function field(
  value: string,
  confidence: number,
  rationale = "test"
): { value: string; confidence: number; rationale: string } {
  return { value, confidence, rationale }
}

function detection(
  partial: Partial<ImageDetection> & {
    photoKind: ImageDetection["photoKind"]
    imageSummary: string
  }
): ImageDetection {
  const unk = field("Unknown", 0.2)
  return {
    brand: unk,
    licensedProperty: unk,
    character: unk,
    theme: unk,
    features: unk,
    itemType: unk,
    category: field("Women > Clothing > Tops", 0.7),
    size: unk,
    color: field("Black", 0.7),
    material: unk,
    style: field("Blouse", 0.5),
    styleNumber: unk,
    countryOfOrigin: unk,
    pattern: field("Gingham", 0.8),
    gender: field("Women", 0.7),
    condition: { value: "Good", confidence: 0.8, rationale: "test" },
    flaws: field("None visible", 0.9),
    ...partial,
  }
}

/**
 * Exact Tweety shirt photo-set simulation:
 * 1) cover garment (generic blouse guess)
 * 2) embroidered Tweety graphic close-up
 * 3) Looney Tunes care/brand tag
 * 4) size tag 22W
 */
const tweetyPhotoSet: ImageDetection[] = [
  detection({
    photoKind: "garment",
    imageSummary: "Black and white gingham sleeveless button-front blouse on hanger",
    brand: field("Unknown", 0.35, "No brand visible on cover"),
    itemType: field("Women's sleeveless button-front shirt/blouse", 0.86),
    features: field("Collared, sleeveless, button-front, chest pocket", 0.8),
    pattern: field("Black and white gingham/check", 0.9),
    gender: field("Women", 0.75),
    color: field("Black", 0.7),
  }),
  detection({
    photoKind: "graphic",
    imageSummary: "Close-up of embroidered yellow Tweety Bird on chest",
    character: field("Tweety Bird", 0.94, "Embroidered Tweety chest graphic"),
    licensedProperty: field("Looney Tunes", 0.88, "Tweety is Looney Tunes"),
    brand: field("Looney Tunes", 0.7, "Inferred from character embroidery"),
    features: field("Embroidered Tweety chest graphic", 0.95),
    theme: field("Cartoon, Looney Tunes", 0.9),
  }),
  detection({
    photoKind: "tag",
    imageSummary: "Sewn-in Looney Tunes brand label and care tag",
    brand: field("Looney Tunes", 0.97, "Official Looney Tunes label"),
    licensedProperty: field("Looney Tunes", 0.97, "Tag text Looney Tunes"),
    material: field("100% Cotton", 0.92, "Care tag"),
    countryOfOrigin: field("China", 0.85),
    gender: field("Women", 0.9, "Women's tag"),
  }),
  detection({
    photoKind: "tag",
    imageSummary: "Size tag reading 22W",
    size: field("22W", 0.96, "Size tag OCR"),
    brand: field("Looney Tunes", 0.9, "Same label family"),
    gender: field("Women", 0.88),
  }),
]

describe("clothing identity — Tweety photo set", () => {
  it("merges all photos with tag override for brand/size", () => {
    const { fields } = mergeClothingDetections(tweetyPhotoSet)

    assert.equal(fields.brand.value, "Looney Tunes")
    assert.ok(fields.brand.confidence >= 0.9)
    assert.match(fields.brand.rationale || "", /tag\/label/i)

    assert.equal(fields.character.value, "Tweety Bird")
    assert.equal(fields.licensedProperty.value, "Looney Tunes")
    assert.equal(fields.size.value, "22W")
    assert.equal(fields.gender.value, "Women")
    assert.match(fields.pattern.value, /gingham/i)
    assert.match(fields.itemType.value, /sleeveless|shirt|blouse/i)
    assert.match(fields.features.value, /tweety|embroider|pocket|sleeveless/i)
  })

  it("never leaves brand blank when licensed property is visible", () => {
    const result = applyLicensedBrandFallback({
      brand: field("Unknown", 0.2),
      licensedProperty: field("Looney Tunes", 0.95, "Tag"),
      character: field("Tweety Bird", 0.94),
      theme: field("Unknown", 0.1),
    })
    assert.equal(result.brand.value, "Looney Tunes")
    assert.match(result.theme.value, /Cartoon/i)
    assert.match(result.theme.value, /Looney Tunes/i)
  })

  it("second pass upgrades generic garment to Tweety identity", () => {
    const first = mergeClothingDetections([
      detection({
        photoKind: "garment",
        imageSummary: "Gingham sleeveless blouse",
        brand: field("Unknown", 0.3),
        itemType: field("Sleeveless blouse", 0.8),
        pattern: field("Gingham", 0.85),
        gender: field("Women", 0.7),
      }),
    ]).fields

    assert.ok(needsIdentitySecondPass(first, tweetyPhotoSet))

    const merged = mergeIdentitySecondPass(first, {
      brand: field("Looney Tunes", 0.96),
      licensedProperty: field("Looney Tunes", 0.96),
      character: field("Tweety Bird", 0.95),
      theme: field("Cartoon, Looney Tunes", 0.93),
      features: field(
        "Embroidered Tweety chest graphic, chest pocket, collared, sleeveless",
        0.92
      ),
      itemType: field("Women's sleeveless button-front shirt/blouse", 0.9),
      size: field("22W", 0.95),
      gender: field("Women", 0.9),
      material: field("100% Cotton", 0.9),
      styleNumber: field("Unknown", 0.1),
      countryOfOrigin: field("China", 0.8),
      pattern: field("Black and white gingham/check", 0.9),
      logoAndGraphicSummary: "Embroidered Tweety Bird on chest",
      tagTextSummary: "Looney Tunes / 22W / 100% Cotton",
    })

    assert.equal(merged.brand.value, "Looney Tunes")
    assert.equal(merged.character.value, "Tweety Bird")
    assert.equal(merged.size.value, "22W")
    assert.match(merged.theme.value, /Cartoon/)
  })

  it("tag photo overrides cover brand guess", () => {
    const best = pickBestPreferTag([
      {
        value: "Unbranded",
        confidence: 0.8,
        rationale: "cover guess",
        photoKind: "garment",
      },
      {
        value: "Looney Tunes",
        confidence: 0.7,
        rationale: "tag OCR",
        photoKind: "tag",
      },
    ])
    assert.equal(best.value, "Looney Tunes")
    assert.ok(best.confidence >= 0.92)
  })

  it("reports extracted fields and suggested title for the photo set", () => {
    const { fields } = mergeClothingDetections(tweetyPhotoSet)
    const extras = identityExtrasFromFields(fields)

    const listing: Listing = {
      id: "tweety-test",
      userId: "u1",
      title: "Looney Tunes Shirt",
      description: "Vintage cartoon blouse",
      price: 24,
      currency: "USD",
      keywords: [],
      specifics: {
        brand: fields.brand.value,
        size: fields.size.value,
        color: fields.color.value,
        material: fields.material.value,
        style: fields.itemType.value,
        pattern: fields.pattern.value,
        gender: fields.gender.value,
        extras: {
          ...extras,
          Vintage: "Yes",
        },
      },
      fieldConfidence: {
        brand: fields.brand,
        character: fields.character,
        theme: fields.theme,
        features: fields.features,
        itemType: fields.itemType,
        size: fields.size,
        gender: fields.gender,
        pattern: fields.pattern,
      },
      images: [],
      status: "draft",
      marketplaceListings: [],
      targetMarketplaces: ["ebay"],
      aiGenerated: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const title = enrichEbayTitleTowardLimit(
      "Looney Tunes Shirt",
      listing
    )
    const built = buildEbayOptimizedTitle(listing)

    const report = {
      Brand: fields.brand.value,
      Character: fields.character.value,
      Size: fields.size.value,
      Department: fields.gender.value,
      Type: fields.itemType.value,
      Pattern: fields.pattern.value,
      Features: fields.features.value,
      Theme: fields.theme.value,
      SuggestedTitle: title.length >= built.length ? title : built,
    }

    console.log("TWEETY_EXTRACTION_REPORT", JSON.stringify(report, null, 2))

    assert.equal(report.Brand, "Looney Tunes")
    assert.equal(report.Character, "Tweety Bird")
    assert.equal(report.Size, "22W")
    assert.equal(report.Department, "Women")
    assert.match(report.Type, /shirt|blouse/i)
    assert.match(report.Pattern, /gingham/i)
    assert.match(report.SuggestedTitle, /Looney Tunes/i)
    assert.match(report.SuggestedTitle, /Tweety/i)
    assert.ok(report.SuggestedTitle.length <= 80)
    assert.ok(report.SuggestedTitle.length >= 55)
  })

  it("shows confirm box when brand/character confidence < 90%", () => {
    assert.equal(
      needsBrandCharacterConfirm({
        brand: field("Looney Tunes", 0.82),
        character: field("Tweety Bird", 0.88),
      }),
      true
    )
    assert.equal(
      needsBrandCharacterConfirm({
        brand: field("Looney Tunes", 0.95),
        character: field("Tweety Bird", 0.94),
      }),
      false
    )
  })

  it("mapDraftToListingFields preserves Character/Theme/Features/Type extras", () => {
    const draft: GeneratedListingOutput = {
      title: "Vintage Looney Tunes Tweety Bird Women's Gingham Shirt 22W",
      description: "Cute Tweety blouse",
      price: 22,
      currency: "USD",
      keywords: ["looney tunes", "tweety", "gingham"],
      specifics: {
        brand: "Looney Tunes",
        size: "22W",
        color: "Black",
        material: "100% Cotton",
        style: "Sleeveless Button Shirt",
        pattern: "Gingham",
        gender: "Women",
        condition: "Good",
        category: "Women > Tops",
        flaws: "None visible",
        extras: {
          Character: "Tweety Bird",
          Theme: "Cartoon, Looney Tunes",
          Features: "Embroidered Tweety chest graphic, chest pocket",
          Type: "Women's sleeveless button-front shirt/blouse",
        },
      },
      fieldConfidence: {
        brand: field("Looney Tunes", 0.97),
        character: field("Tweety Bird", 0.94),
        theme: field("Cartoon, Looney Tunes", 0.9),
        features: field("Embroidered Tweety chest graphic", 0.93),
        itemType: field("Women's sleeveless button-front shirt/blouse", 0.9),
        size: field("22W", 0.96),
      },
      comps: {
        suggestedPrice: 22,
        lowPrice: 15,
        highPrice: 30,
        currency: "USD",
        confidence: 0.7,
        method: "ai_market_comps",
        rationale: "test",
        comparableSummary: "test",
        sampleSize: 5,
      },
      perImage: [],
    }

    const mapped = mapDraftToListingFields(draft)
    assert.equal(mapped.specifics.brand, "Looney Tunes")
    assert.equal(mapped.specifics.extras?.Character, "Tweety Bird")
    assert.equal(mapped.specifics.extras?.Theme, "Cartoon, Looney Tunes")
    assert.match(mapped.specifics.extras?.Features || "", /Tweety/)
    assert.match(mapped.specifics.extras?.Type || "", /sleeveless/i)
    assert.equal(mapped.fieldConfidence.character?.value, "Tweety Bird")
  })
})
