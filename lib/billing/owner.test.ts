import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  FOUNDER_OWNER_BADGE,
  FOUNDER_OWNER_LABEL,
  LIFETIME_FOUNDER_ACCESS,
  LISTWISE_OWNER_EMAIL,
  authUserHasOwnerEmail,
  collectAuthUserEmails,
  isListWiseOwnerEmail,
  isOwnerBillingStatus,
  normalizeBillingEmail,
  ownerBypassesMarketplaceSubscription,
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

  it("exposes Founder display copy and owner billing detection", () => {
    assert.equal(FOUNDER_OWNER_BADGE, "👑 Founder • Owner")
    assert.equal(FOUNDER_OWNER_LABEL, "Founder • Owner")
    assert.equal(LIFETIME_FOUNDER_ACCESS, "Lifetime Founder Access")
    assert.equal(isOwnerBillingStatus({ ownerOverride: true }), true)
    assert.equal(isOwnerBillingStatus({ status: "owner" }), true)
    assert.equal(isOwnerBillingStatus({ status: "active" }), false)
  })

  it("collects Owner email from identities when user.email is empty", () => {
    const emails = collectAuthUserEmails({
      email: null,
      identities: [
        {
          identity_data: { email: "leerankinmedia@gmail.com" },
        },
      ],
    })
    assert.deepEqual(emails, ["leerankinmedia@gmail.com"])
    assert.equal(
      authUserHasOwnerEmail({
        email: null,
        identities: [
          { identity_data: { email: "Leerankinmedia@Gmail.com" } },
        ],
      }),
      true
    )
  })

  it("bypasses marketplace subscription checks for the Owner session", () => {
    assert.equal(
      ownerBypassesMarketplaceSubscription({
        id: "user-1",
        email: "leerankinmedia@gmail.com",
      }),
      true
    )
    assert.equal(
      ownerBypassesMarketplaceSubscription({
        id: "user-1",
        email: null,
        identities: [
          { identity_data: { email: "leerankinmedia@gmail.com" } },
        ],
      }),
      true
    )
    assert.equal(
      ownerBypassesMarketplaceSubscription({
        id: "user-1",
        email: "other@example.com",
      }),
      false
    )
    assert.equal(
      ownerBypassesMarketplaceSubscription({
        id: null,
        email: "leerankinmedia@gmail.com",
      }),
      false
    )
  })
})
