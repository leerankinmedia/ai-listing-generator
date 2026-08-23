import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"
import {
  checkpoint,
  publishFailureBody,
  resetPublishTrace,
  sanitizePublishErrorMessage,
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
    assert.match(body.error, /sharp|image converter/i)
    assert.equal(typeof body.error, "string")
    assert.equal(body.error.includes("<!DOCTYPE"), false)
    assert.equal(body.error.includes("Possible solutions:"), false)
    assert.equal(body.error.includes("npm install --os="), false)
  })

  it("replaces Sharp's linux-x64 dependency dump with a short bake failure", () => {
    const dump = `Could not load the "sharp" module using the linux-x64 runtime
Possible solutions:
- Ensure optional dependencies can be installed: npm install --include=optional sharp
- Add platform-specific dependencies:
    npm install --os=linux --cpu=x64 sharp
ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file`
    const message = sanitizePublishErrorMessage(dump)
    assert.match(message, /bake ListWise-preview pixels/i)
    assert.equal(message.includes("Possible solutions:"), false)
    assert.equal(message.includes("npm install --os="), false)
    assert.ok(message.length < 280)
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
