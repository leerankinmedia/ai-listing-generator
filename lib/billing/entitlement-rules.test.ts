import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { decideEntitlement } from "@/lib/billing/entitlement-rules"

const NOW = Date.parse("2026-07-25T12:00:00.000Z")

describe("decideEntitlement", () => {
  it("denies DB active + future period end without Stripe verification", () => {
    const result = decideEntitlement(
      {
        rawDatabaseStatus: "active",
        trialEnd: "2026-07-22T00:00:00.000Z",
        stripeSubscriptionIdPresent: false,
        stripeVerifiedStatus: null,
      },
      NOW
    )
    assert.equal(result.allowed, false)
    assert.equal(result.status, "expired")
    assert.equal(result.displayPeriodEnd, null)
    assert.equal(result.decidingField, "db_active_without_stripe_id")
  })

  it("denies when Stripe id exists but Stripe says canceled (DB still active)", () => {
    const result = decideEntitlement(
      {
        rawDatabaseStatus: "active",
        trialEnd: "2026-07-22T00:00:00.000Z",
        stripeSubscriptionIdPresent: true,
        stripeVerifiedStatus: "canceled",
        stripeCurrentPeriodEnd: "2026-08-22T00:00:00.000Z",
      },
      NOW
    )
    assert.equal(result.allowed, false)
    assert.equal(result.status, "expired")
    assert.equal(result.displayPeriodEnd, null)
    assert.match(result.decidingField, /stripe_verified_canceled/)
  })

  it("allows only Stripe-verified active", () => {
    const result = decideEntitlement(
      {
        rawDatabaseStatus: "canceled",
        trialEnd: "2026-07-22T00:00:00.000Z",
        stripeSubscriptionIdPresent: true,
        stripeVerifiedStatus: "active",
        stripeCurrentPeriodEnd: "2026-08-22T00:00:00.000Z",
      },
      NOW
    )
    assert.equal(result.allowed, true)
    assert.equal(result.status, "active")
    assert.equal(result.displayPeriodEnd, "2026-08-22T00:00:00.000Z")
  })

  it("allows Stripe-verified trialing only before trial_end", () => {
    const ok = decideEntitlement(
      {
        rawDatabaseStatus: "trialing",
        trialEnd: "2026-07-22T00:00:00.000Z",
        stripeSubscriptionIdPresent: true,
        stripeVerifiedStatus: "trialing",
        stripeTrialEnd: "2026-07-28T00:00:00.000Z",
      },
      NOW
    )
    assert.equal(ok.allowed, true)
    assert.equal(ok.status, "trialing")

    const expired = decideEntitlement(
      {
        rawDatabaseStatus: "trialing",
        trialEnd: "2026-07-22T00:00:00.000Z",
        stripeSubscriptionIdPresent: true,
        stripeVerifiedStatus: "trialing",
        stripeTrialEnd: "2026-07-22T00:00:00.000Z",
      },
      NOW
    )
    assert.equal(expired.allowed, false)
    assert.equal(expired.status, "expired")
  })

  it("never grants from simulated local trialing without Stripe id", () => {
    const result = decideEntitlement(
      {
        rawDatabaseStatus: "trialing",
        trialEnd: "2026-08-01T00:00:00.000Z",
        stripeSubscriptionIdPresent: false,
        stripeVerifiedStatus: null,
      },
      NOW
    )
    assert.equal(result.allowed, false)
    assert.equal(result.decidingField, "simulated_trialing_without_stripe")
  })

  it("allows admin override by flag", () => {
    const result = decideEntitlement(
      {
        rawDatabaseStatus: "expired",
        trialEnd: "2026-07-22T00:00:00.000Z",
        stripeSubscriptionIdPresent: false,
        stripeVerifiedStatus: null,
        isAdmin: true,
      },
      NOW
    )
    assert.equal(result.allowed, true)
    assert.equal(result.status, "admin")
  })
})
