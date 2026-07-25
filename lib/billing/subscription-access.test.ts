import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { deriveSubscriptionAccess } from "@/lib/billing/subscription-access"

const NOW = Date.parse("2026-07-25T12:00:00.000Z")

describe("deriveSubscriptionAccess", () => {
  it("allows a valid trial before trial_end", () => {
    const result = deriveSubscriptionAccess(
      {
        status: "trialing",
        trial_end: "2026-07-28T00:00:00.000Z",
        current_period_end: "2026-07-28T00:00:00.000Z",
        stripe_subscription_id: "sub_test",
      },
      NOW
    )
    assert.equal(result.allowed, true)
    assert.equal(result.effectiveStatus, "trialing")
    assert.equal(result.displayPeriodEnd, null)
  })

  it("locks an expired trial ended July 22 when today is July 25", () => {
    const result = deriveSubscriptionAccess(
      {
        status: "trialing",
        trial_end: "2026-07-22T00:00:00.000Z",
        current_period_end: "2026-08-01T00:00:00.000Z",
        stripe_subscription_id: "sub_trial",
      },
      NOW
    )
    assert.equal(result.allowed, false)
    assert.equal(result.effectiveStatus, "expired")
    assert.equal(result.displayPeriodEnd, null)
    assert.equal(result.shouldPersistExpired, true)
  })

  it("does not treat simulated active without Stripe subscription as paid", () => {
    const result = deriveSubscriptionAccess(
      {
        status: "active",
        trial_end: "2026-07-22T00:00:00.000Z",
        current_period_end: "2026-08-01T00:00:00.000Z",
        stripe_subscription_id: null,
      },
      NOW
    )
    assert.equal(result.allowed, false)
    assert.equal(result.effectiveStatus, "expired")
    assert.equal(result.displayPeriodEnd, null)
  })

  it("allows a real paid Stripe subscription that is still in period", () => {
    const result = deriveSubscriptionAccess(
      {
        status: "active",
        trial_end: "2026-07-22T00:00:00.000Z",
        current_period_end: "2026-08-25T00:00:00.000Z",
        stripe_subscription_id: "sub_live_123",
      },
      NOW
    )
    assert.equal(result.allowed, true)
    assert.equal(result.effectiveStatus, "active")
    assert.equal(result.displayPeriodEnd, "2026-08-25T00:00:00.000Z")
  })

  it("shows expired after a past trial is persisted as canceled without Stripe", () => {
    const result = deriveSubscriptionAccess(
      {
        status: "canceled",
        trial_end: "2026-07-22T00:00:00.000Z",
        current_period_end: null,
        stripe_subscription_id: null,
      },
      NOW
    )
    assert.equal(result.allowed, false)
    assert.equal(result.effectiveStatus, "expired")
    assert.equal(result.displayPeriodEnd, null)
  })
})
