import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { countChallengeActivity } from "@/lib/challenge/activity"
import type { Listing } from "@/lib/types"

function listing(partial: Partial<Listing> & Pick<Listing, "id" | "status">): Listing {
  return {
    userId: "u1",
    title: "Item",
    description: "",
    price: 10,
    currency: "USD",
    keywords: [],
    specifics: {},
    fieldConfidence: {},
    images: [],
    marketplaceListings: [],
    targetMarketplaces: [],
    aiGenerated: false,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T12:00:00.000Z",
    ...partial,
  }
}

const dayStart = Date.parse("2026-07-10T00:00:00.000Z")
const dayEnd = Date.parse("2026-07-11T00:00:00.000Z")

describe("countChallengeActivity", () => {
  it("does not count drafts", () => {
    const rows = [
      listing({
        id: "1",
        status: "draft",
        createdAt: "2026-07-10T01:00:00.000Z",
        updatedAt: "2026-07-10T02:00:00.000Z",
      }),
    ]
    assert.equal(countChallengeActivity(rows, "list", dayStart, dayEnd), 0)
  })

  it("counts listed items on list days", () => {
    const rows = [
      listing({
        id: "1",
        status: "listed",
        createdAt: "2026-07-10T01:00:00.000Z",
        updatedAt: "2026-07-10T02:00:00.000Z",
      }),
      listing({
        id: "2",
        status: "ready",
        createdAt: "2026-07-10T01:00:00.000Z",
        updatedAt: "2026-07-10T02:00:00.000Z",
      }),
    ]
    assert.equal(countChallengeActivity(rows, "list", dayStart, dayEnd), 1)
  })

  it("counts only pre-existing items on relist days", () => {
    const rows = [
      listing({
        id: "old",
        status: "listed",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-10T08:00:00.000Z",
      }),
      listing({
        id: "new",
        status: "listed",
        createdAt: "2026-07-10T03:00:00.000Z",
        updatedAt: "2026-07-10T04:00:00.000Z",
      }),
    ]
    assert.equal(countChallengeActivity(rows, "relist", dayStart, dayEnd), 1)
  })

  it("returns 0 for rest days", () => {
    const rows = [
      listing({
        id: "1",
        status: "listed",
        createdAt: "2026-07-10T01:00:00.000Z",
        updatedAt: "2026-07-10T02:00:00.000Z",
      }),
    ]
    assert.equal(countChallengeActivity(rows, "rest", dayStart, dayEnd), 0)
  })
})
