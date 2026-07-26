import assert from "node:assert/strict"
import { describe, it, beforeEach, afterEach } from "node:test"

describe("ebayEnv environment selection", () => {
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
  })

  afterEach(() => {
    for (const key of keys) {
      const value = previous[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it("defaults to production and uses api.ebay.com / auth.ebay.com", async () => {
    const { ebayEnv, ebayApiBase, ebayAuthBase } = await import(
      "@/lib/marketplaces/adapters/ebay/oauth"
    )
    assert.equal(ebayEnv(), "production")
    assert.equal(ebayApiBase(), "https://api.ebay.com")
    assert.equal(ebayAuthBase(), "https://auth.ebay.com")
  })

  it("honors EBAY_ENVIRONMENT=sandbox as optional fallback", async () => {
    process.env.EBAY_ENVIRONMENT = "sandbox"
    const { ebayEnv, ebayApiBase, ebayAuthBase } = await import(
      "@/lib/marketplaces/adapters/ebay/oauth"
    )
    assert.equal(ebayEnv(), "sandbox")
    assert.equal(ebayApiBase(), "https://api.sandbox.ebay.com")
    assert.equal(ebayAuthBase(), "https://auth.sandbox.ebay.com")
  })

  it("falls back to legacy EBAY_ENV when EBAY_ENVIRONMENT is unset", async () => {
    process.env.EBAY_ENV = "sandbox"
    const { ebayEnv } = await import("@/lib/marketplaces/adapters/ebay/oauth")
    assert.equal(ebayEnv(), "sandbox")
  })

  it("prefers EBAY_ENVIRONMENT over legacy EBAY_ENV", async () => {
    process.env.EBAY_ENVIRONMENT = "production"
    process.env.EBAY_ENV = "sandbox"
    const { ebayEnv } = await import("@/lib/marketplaces/adapters/ebay/oauth")
    assert.equal(ebayEnv(), "production")
  })

  it("prefers EBAY_REDIRECT_URI over legacy EBAY_RU_NAME", async () => {
    process.env.EBAY_REDIRECT_URI = "Prod_RuName_Example"
    process.env.EBAY_RU_NAME = "Legacy_Sandbox_RuName"
    const { ebayRedirectUri, ebayRuName, isEbayConfigured } = await import(
      "@/lib/marketplaces/adapters/ebay/oauth"
    )
    process.env.EBAY_CLIENT_ID = "id"
    process.env.EBAY_CLIENT_SECRET = "secret"
    assert.equal(ebayRedirectUri(), "Prod_RuName_Example")
    assert.equal(ebayRuName(), "Prod_RuName_Example")
    assert.equal(isEbayConfigured(), true)
  })

  it("accepts legacy EBAY_RU_NAME when EBAY_REDIRECT_URI is unset", async () => {
    process.env.EBAY_RU_NAME = "Legacy_Sandbox_RuName"
    process.env.EBAY_CLIENT_ID = "id"
    process.env.EBAY_CLIENT_SECRET = "secret"
    const { ebayRedirectUri, isEbayConfigured } = await import(
      "@/lib/marketplaces/adapters/ebay/oauth"
    )
    assert.equal(ebayRedirectUri(), "Legacy_Sandbox_RuName")
    assert.equal(isEbayConfigured(), true)
  })
})
