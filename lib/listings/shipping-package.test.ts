import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  formatMissingShippingPackageMessage,
  missingShippingPackageFields,
  normalizeShippingWeight,
  toEbayPackageWeightAndSize,
  totalWeightPounds,
} from "@/lib/listings/shipping-package"

describe("shipping package validation", () => {
  it("lists weight and dimension fields when package is missing", () => {
    const missing = missingShippingPackageFields(undefined)
    assert.ok(missing.includes("weight pounds"))
    assert.ok(missing.includes("package length"))
    assert.ok(!missing.includes("package type"))
  })

  it("requires total weight > 0 without inventing defaults", () => {
    const missing = missingShippingPackageFields({
      weightPounds: 0,
      weightOunces: 0,
      lengthInches: 12,
      widthInches: 9,
      heightInches: 1,
      packageType: "PACKAGE_THICK_ENVELOPE",
    })
    assert.ok(missing.some((m) => m.includes("weight")))
  })

  it("accepts ounces-only weight and auto package type", () => {
    const missing = missingShippingPackageFields({
      weightPounds: 0,
      weightOunces: 8,
      lengthInches: 12,
      widthInches: 9,
      heightInches: 1,
      packageType: "",
    })
    assert.deepEqual(missing, [])
  })

  it("formats a clear publish block message", () => {
    const msg = formatMissingShippingPackageMessage([
      "weight pounds",
      "package length",
    ])
    assert.match(msg, /Missing: weight pounds, package length/)
  })
})

describe("toEbayPackageWeightAndSize", () => {
  it("converts pounds+ounces to fractional POUND", () => {
    const body = toEbayPackageWeightAndSize({
      weightPounds: 1,
      weightOunces: 8,
      lengthInches: 12,
      widthInches: 10,
      heightInches: 2,
      packageType: "MAILING_BOX",
    })
    assert.equal(body.weight.unit, "POUND")
    assert.equal(body.weight.value, 1.5)
    assert.equal(body.dimensions.unit, "INCH")
    assert.equal(body.packageType, "MAILING_BOX")
  })

  it("defaults package type when blank", () => {
    const body = toEbayPackageWeightAndSize({
      weightPounds: 0,
      weightOunces: 8,
      lengthInches: 12,
      widthInches: 9,
      heightInches: 1,
      packageType: "",
    })
    assert.equal(body.packageType, "PACKAGE_THICK_ENVELOPE")
  })

  it("normalizes overflow ounces", () => {
    const n = normalizeShippingWeight(0, 20)
    assert.equal(n.weightPounds, 1)
    assert.equal(n.weightOunces, 4)
    assert.equal(totalWeightPounds({ weightPounds: 0, weightOunces: 8 }), 0.5)
  })
})
