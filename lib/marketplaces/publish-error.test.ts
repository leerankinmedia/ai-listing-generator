import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"
import {
  checkpoint,
  publishFailureBody,
  resetPublishTrace,
} from "@/lib/marketplaces/publish-error"

describe("publish JSON failure payload", () => {
  it("includes the last checkpoint stage instead of an HTML page", () => {
    resetPublishTrace()
    checkpoint("image_preparation", { photoCount: 6 })
    const body = publishFailureBody(
      new Error("Could not load the sharp module using the linux-x64 runtime")
    )
    assert.equal(body.stage, "image_preparation")
    assert.equal(body.details.photoCount, 6)
    assert.match(body.error, /sharp/i)
    assert.equal(typeof body.error, "string")
    assert.equal(body.error.includes("<!DOCTYPE"), false)
  })

  it("surfaces MarketplaceError code in details", () => {
    resetPublishTrace()
    checkpoint("offer", { sku: "LW1" })
    const body = publishFailureBody(
      new MarketplaceError("eBay rejected the offer.", "ebay_offer_rejected", 400)
    )
    assert.equal(body.stage, "offer")
    assert.equal(body.details.code, "ebay_offer_rejected")
    assert.equal(body.error, "eBay rejected the offer.")
  })
})
