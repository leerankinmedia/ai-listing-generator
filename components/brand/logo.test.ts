import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { toRelativeAppHref } from "@/components/brand/logo"

describe("toRelativeAppHref", () => {
  it("keeps relative routes unchanged", () => {
    assert.equal(toRelativeAppHref("/dashboard"), "/dashboard")
    assert.equal(toRelativeAppHref("/dashboard/listings"), "/dashboard/listings")
  })

  it("strips absolute production hosts down to the path", () => {
    assert.equal(
      toRelativeAppHref("https://ai-listing-generator-n2ji.vercel.app/dashboard"),
      "/dashboard"
    )
  })
})
