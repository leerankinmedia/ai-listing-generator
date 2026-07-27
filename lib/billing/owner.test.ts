import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  LISTWISE_OWNER_EMAIL,
  isListWiseOwnerEmail,
  normalizeBillingEmail,
} from "@/lib/billing/owner"

describe("ListWise Owner email", () => {
  it("recognizes the permanent Owner email case-insensitively", () => {
    assert.equal(LISTWISE_OWNER_EMAIL, "leerankinmedia@gmail.com")
    assert.equal(isListWiseOwnerEmail("leerankinmedia@gmail.com"), true)
    assert.equal(isListWiseOwnerEmail("Leerankinmedia@Gmail.com"), true)
    assert.equal(isListWiseOwnerEmail("  Leerankinmedia@Gmail.com  "), true)
  })

  it("rejects every other account", () => {
    assert.equal(isListWiseOwnerEmail("other@example.com"), false)
    assert.equal(isListWiseOwnerEmail(""), false)
    assert.equal(isListWiseOwnerEmail(null), false)
    assert.equal(isListWiseOwnerEmail(undefined), false)
    assert.equal(
      isListWiseOwnerEmail("leerankinmedia@gmail.com.evil"),
      false
    )
  })

  it("normalizes email for comparison", () => {
    assert.equal(
      normalizeBillingEmail("  Foo@Example.COM "),
      "foo@example.com"
    )
  })
})
