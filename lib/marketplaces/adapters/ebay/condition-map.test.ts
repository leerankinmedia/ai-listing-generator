import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  conditionIdAllowedForCategory,
  mapAiConditionToPolicy,
} from "@/lib/marketplaces/adapters/ebay/condition-map"
import { buildCategorySuggestionQuery } from "@/lib/marketplaces/adapters/ebay/category-suggest-query"

describe("mapAiConditionToPolicy", () => {
  const clothingPolicies = [
    {
      conditionId: "1000",
      conditionDescription: "New with tags",
    },
    {
      conditionId: "1500",
      conditionDescription: "New without tags",
    },
    {
      conditionId: "3000",
      conditionDescription: "Pre-owned",
    },
  ]

  it("maps Pre-owned to the Pre-owned policy for that category", () => {
    const mapped = mapAiConditionToPolicy("Pre-owned", clothingPolicies)
    assert.ok(mapped)
    assert.equal(mapped!.conditionId, "3000")
    assert.equal(mapped!.conditionName, "Pre-owned")
    assert.equal(mapped!.conditionEnum, "USED_EXCELLENT")
  })

  it("maps Good / Excellent used labels onto Pre-owned when that is the used option", () => {
    const mapped = mapAiConditionToPolicy("Good", clothingPolicies)
    assert.ok(mapped)
    assert.equal(mapped!.conditionId, "3000")
  })

  it("maps New with tags exactly", () => {
    const mapped = mapAiConditionToPolicy("New with tags", clothingPolicies)
    assert.ok(mapped)
    assert.equal(mapped!.conditionId, "1000")
    assert.equal(mapped!.conditionEnum, "NEW")
  })

  it("never invents an ID outside the policy list", () => {
    const mapped = mapAiConditionToPolicy("Pre-owned", clothingPolicies)
    assert.ok(mapped)
    assert.ok(
      clothingPolicies.some((p) => p.conditionId === mapped!.conditionId)
    )
    assert.equal(
      conditionIdAllowedForCategory(mapped!.conditionId, clothingPolicies),
      true
    )
    assert.equal(conditionIdAllowedForCategory("9999", clothingPolicies), false)
  })

  it("handles electronics-style used enums without clothing Pre-owned label", () => {
    const electronics = [
      { conditionId: "1000", conditionDescription: "New" },
      { conditionId: "3000", conditionDescription: "Used" },
      { conditionId: "7000", conditionDescription: "For parts or not working" },
    ]
    const mapped = mapAiConditionToPolicy("Pre-owned", electronics)
    assert.ok(mapped)
    assert.equal(mapped!.conditionId, "3000")
  })
})

describe("buildCategorySuggestionQuery", () => {
  it("combines title, type, department, brand, and keywords", () => {
    const q = buildCategorySuggestionQuery({
      title: "Nike Club Fleece Sweatshirt",
      itemType: "Sweatshirt",
      department: "Women",
      brand: "Nike",
      keywords: ["hoodie", "pullover"],
    })
    assert.match(q, /Nike/i)
    assert.match(q, /Sweatshirt/i)
    assert.match(q, /Women/i)
  })
})
