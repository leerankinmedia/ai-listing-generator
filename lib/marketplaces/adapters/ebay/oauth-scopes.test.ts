import assert from "node:assert/strict"
import { describe, it, beforeEach, afterEach } from "node:test"

describe("ebay OAuth scopes", () => {
  const keys = [
    "EBAY_ENVIRONMENT",
    "EBAY_ENV",
    "EBAY_CLIENT_ID",
    "EBAY_CLIENT_SECRET",
    "EBAY_REDIRECT_URI",
    "EBAY_RU_NAME",
  ] as const
  const previous: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of keys) {
      previous[key] = process.env[key]
      delete process.env[key]
    }
    process.env.EBAY_CLIENT_ID = "test-client-id"
    process.env.EBAY_CLIENT_SECRET = "test-secret"
    process.env.EBAY_REDIRECT_URI = "Prod_RuName_Example"
    process.env.EBAY_ENVIRONMENT = "production"
  })

  afterEach(() => {
    for (const key of keys) {
      const value = previous[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it("default publish scopes exclude sell.marketing", async () => {
    const {
      EBAY_PUBLISH_SCOPE_LIST,
      EBAY_MARKETING_SCOPE,
      ebayScopesForAuthorize,
      ebayScopesJoined,
    } = await import("@/lib/marketplaces/adapters/ebay/oauth")

    assert.ok(!EBAY_PUBLISH_SCOPE_LIST.includes(EBAY_MARKETING_SCOPE as never))
    assert.ok(
      EBAY_PUBLISH_SCOPE_LIST.every((s) =>
        s.startsWith("https://api.ebay.com/oauth/api_scope")
      )
    )
    assert.ok(
      EBAY_PUBLISH_SCOPE_LIST.includes(
        "https://api.ebay.com/oauth/api_scope/sell.inventory"
      )
    )

    const defaults = ebayScopesForAuthorize()
    assert.equal(defaults.includes(EBAY_MARKETING_SCOPE), false)
    assert.equal(ebayScopesJoined().includes("sell.marketing"), false)

    const withMarketing = ebayScopesForAuthorize({ includeMarketing: true })
    assert.equal(withMarketing.includes(EBAY_MARKETING_SCOPE), true)
    assert.ok(withMarketing.includes("https://api.ebay.com/oauth/api_scope/sell.inventory"))
  })
})
