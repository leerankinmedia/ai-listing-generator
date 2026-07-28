import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  matchExactEbayAspectValue,
  splitPrimaryColorAndDetails,
} from "@/lib/marketplaces/adapters/ebay/aspect-normalize"

describe("splitPrimaryColorAndDetails", () => {
  it("maps White with red stitch → White + red stitching", () => {
    const split = splitPrimaryColorAndDetails("White with red stitch")
    assert.equal(split.primaryLabel, "White")
    assert.equal(split.primary, "white")
    assert.match(split.detail || "", /red stitch/i)
  })

  it("keeps Dark Gray/Charcoal as gray primary", () => {
    const split = splitPrimaryColorAndDetails("Dark Gray/Charcoal")
    assert.equal(split.primary, "gray")
    assert.equal(split.primaryLabel, "Gray")
  })
})

describe("matchExactEbayAspectValue color primary", () => {
  it("selects White from White with red stitch against allowed list", () => {
    const value = matchExactEbayAspectValue(
      "Color",
      ["White with red stitch"],
      ["Black", "White", "Red", "Blue", "Gray"],
      { selectionOnly: true, highConfidence: true }
    )
    assert.equal(value, "White")
  })

  it("normalizes material cotton blend", () => {
    const value = matchExactEbayAspectValue(
      "Material",
      ["100% Cotton"],
      ["Cotton", "Polyester", "Wool"],
      { selectionOnly: true, highConfidence: true }
    )
    assert.equal(value, "Cotton")
  })

  it("normalizes department mens → Men when allowed", () => {
    const value = matchExactEbayAspectValue(
      "Department",
      ["Mens"],
      ["Men", "Women", "Unisex"],
      { selectionOnly: true, highConfidence: true }
    )
    assert.equal(value, "Men")
  })
})
