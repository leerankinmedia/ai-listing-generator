import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  doesNotApplyValue,
  identifierLooksValid,
  isProductIdentifierAspect,
  isVerifiedProductIdentifier,
  looksLikeMpn,
} from "@/lib/listings/product-identifiers"

describe("product identifiers", () => {
  it("recognizes identifier aspect names", () => {
    assert.equal(isProductIdentifierAspect("MPN"), true)
    assert.equal(isProductIdentifierAspect("Manufacturer Part Number"), true)
    assert.equal(isProductIdentifierAspect("UPC"), true)
    assert.equal(isProductIdentifierAspect("Brand"), false)
  })

  it("rejects fabricated MPN-like guesses", () => {
    assert.equal(looksLikeMpn("Jeans"), false)
    assert.equal(looksLikeMpn("32"), false)
    assert.equal(looksLikeMpn("32x30"), false)
    assert.equal(looksLikeMpn("American Eagle"), false)
    assert.equal(looksLikeMpn("XL"), false)
    assert.equal(looksLikeMpn("AEMTADGO8USA"), false)
    assert.equal(looksLikeMpn("AEJEANS32"), false)
    assert.equal(looksLikeMpn("AE12345"), false)
    assert.equal(looksLikeMpn("0773-2341"), true)
  })

  it("validates UPC/EAN length", () => {
    assert.equal(identifierLooksValid("upc", "885715512345"), true)
    assert.equal(identifierLooksValid("upc", "123"), false)
    assert.equal(identifierLooksValid("ean", "4006381333931"), true)
  })

  it("does not treat a style number as a verified MPN", () => {
    assert.equal(
      isVerifiedProductIdentifier({
        kind: "mpn",
        value: "1234",
        confidence: 0.99,
        rationale: "Style number from tag",
        sourceField: "styleNumber",
      }),
      false
    )
  })

  it("rejects the American Eagle fabricated MPN even from a tag photo", () => {
    assert.equal(
      isVerifiedProductIdentifier({
        kind: "mpn",
        value: "AEMTADGO8USA",
        confidence: 0.96,
        rationale: "Tag/label photo override. Code on the care tag.",
        sourceField: "mpn",
      }),
      false
    )
    assert.equal(
      isVerifiedProductIdentifier({
        kind: "mpn",
        value: "AEMTADGO8USA",
        confidence: 0.99,
        rationale: "Tag labeled MPN AEMTADGO8USA",
        sourceField: "mpn",
      }),
      false
    )
  })

  it("does not verify MPN from high confidence without an explicit MPN label", () => {
    assert.equal(
      isVerifiedProductIdentifier({
        kind: "mpn",
        value: "0773-2341",
        confidence: 0.96,
        rationale: "Tag/label photo override.",
        sourceField: "mpn",
      }),
      false
    )
  })

  it("does not convert a style number into MPN", () => {
    assert.equal(
      isVerifiedProductIdentifier({
        kind: "mpn",
        value: "0118-2341",
        confidence: 0.99,
        rationale: "Tag labeled MPN 0118-2341",
        sourceField: "mpn",
        styleNumber: "0118-2341",
      }),
      false
    )
  })

  it("accepts a tag-labeled MPN with digits", () => {
    assert.equal(
      isVerifiedProductIdentifier({
        kind: "mpn",
        value: "0773-2341",
        confidence: 0.96,
        rationale: "Tag labeled MPN 0773-2341",
        sourceField: "mpn",
      }),
      true
    )
  })

  it("picks Does not apply from taxonomy options", () => {
    assert.equal(
      doesNotApplyValue(["Does not apply", "1234"]),
      "Does not apply"
    )
    assert.equal(doesNotApplyValue([]), "Does not apply")
    assert.equal(doesNotApplyValue(["Slim", "Relaxed"]), undefined)
  })
})
