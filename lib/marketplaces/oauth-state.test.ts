import assert from "node:assert/strict"
import { describe, it, before } from "node:test"

describe("OAuth state cookie / URL payload", () => {
  before(() => {
    process.env.CONNECTIONS_SECRET = "test-connections-secret-32b"
  })

  it("createOAuthState puts the same encrypted payload in urlState and cookie", async () => {
    const { createOAuthState, parseOAuthStateCookie } = await import(
      "./oauth-state"
    )
    const { urlState, cookieValue } = createOAuthState("ebay")
    assert.equal(urlState, cookieValue)
    assert.ok(urlState.length > 40)
    const parsed = parseOAuthStateCookie(cookieValue)
    assert.equal(parsed.marketplaceId, "ebay")
    assert.ok(parsed.nonce.length >= 16)
  })

  it("resolveAndAssertOAuthState works with URL state alone (no cookie)", async () => {
    const { createOAuthState, resolveAndAssertOAuthState } = await import(
      "./oauth-state"
    )
    const { urlState } = createOAuthState("ebay")
    const parsed = resolveAndAssertOAuthState(undefined, urlState, "ebay")
    assert.equal(parsed.marketplaceId, "ebay")
  })

  it("resolveAndAssertOAuthState accepts matching cookie + URL payload", async () => {
    const { createOAuthState, resolveAndAssertOAuthState } = await import(
      "./oauth-state"
    )
    const { urlState, cookieValue } = createOAuthState("ebay")
    const parsed = resolveAndAssertOAuthState(cookieValue, urlState, "ebay")
    assert.equal(parsed.marketplaceId, "ebay")
  })

  it("legacy nonce-in-URL still requires cookie", async () => {
    const {
      createOAuthState,
      parseOAuthStateCookie,
      resolveAndAssertOAuthState,
    } = await import("./oauth-state")
    const { cookieValue } = createOAuthState("ebay")
    const nonce = parseOAuthStateCookie(cookieValue).nonce
    const parsed = resolveAndAssertOAuthState(cookieValue, nonce, "ebay")
    assert.equal(parsed.nonce, nonce)
    assert.throws(
      () => resolveAndAssertOAuthState(undefined, nonce, "ebay"),
      /Missing OAuth state cookie/
    )
  })
})
