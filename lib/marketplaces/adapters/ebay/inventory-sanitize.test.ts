import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  diagnoseEbayInventoryPayload,
  sanitizeEbayInventoryItemPayload,
  sanitizeEbayInventorySku,
  sanitizeEbayProductAspects,
  sanitizeEbayImageUrls,
  sanitizeEbayInventoryCondition,
  sanitizeEbayInventoryQuantity,
} from "@/lib/marketplaces/adapters/ebay/inventory-sanitize"

describe("sanitizeEbayInventorySku", () => {
  it("keeps alphanumeric SKUs", () => {
    assert.equal(sanitizeEbayInventorySku("ABC123").sku, "ABC123")
  })

  it("strips hyphens and underscores from UUIDs", () => {
    const { sku, issues } = sanitizeEbayInventorySku("a1b2-c3d4_e5f6")
    assert.equal(sku, "a1b2c3d4e5f6")
    assert.ok(issues.some((i) => i.field === "sku"))
  })

  it("generates fallback when empty", () => {
    const { sku } = sanitizeEbayInventorySku("!!!")
    assert.match(sku, /^LW\d+$/)
  })
})

describe("sanitizeEbayProductAspects", () => {
  it("drops empty values and trims", () => {
    const { aspects, issues } = sanitizeEbayProductAspects({
      Brand: [" Nike ", ""],
      Color: ["Gray", "Gray"],
      "": ["x"],
      Size: [],
    })
    assert.deepEqual(aspects.Brand, ["Nike"])
    assert.deepEqual(aspects.Color, ["Gray"])
    assert.equal(aspects.Size, undefined)
    assert.ok(issues.length >= 2)
  })
})

describe("sanitizeEbayImageUrls", () => {
  it("keeps unique https URLs only", () => {
    const { imageUrls, issues } = sanitizeEbayImageUrls([
      "https://cdn.example.com/a.jpg",
      "http://cdn.example.com/b.jpg",
      "https://cdn.example.com/a.jpg",
      "not-a-url",
      "https://cdn.example.com/c.jpg",
    ])
    assert.deepEqual(imageUrls, [
      "https://cdn.example.com/a.jpg",
      "https://cdn.example.com/c.jpg",
    ])
    assert.ok(issues.length >= 2)
  })
})

describe("sanitizeEbayInventoryCondition / quantity", () => {
  it("accepts valid condition enums", () => {
    assert.equal(sanitizeEbayInventoryCondition("USED_GOOD").condition, "USED_GOOD")
  })

  it("defaults unknown condition", () => {
    assert.equal(
      sanitizeEbayInventoryCondition("Pretty good").condition,
      "USED_EXCELLENT"
    )
  })

  it("requires positive integer quantity", () => {
    assert.equal(sanitizeEbayInventoryQuantity(0).quantity, 1)
    assert.equal(sanitizeEbayInventoryQuantity(3.5).quantity, 1)
    assert.equal(sanitizeEbayInventoryQuantity(2).quantity, 2)
  })
})

describe("sanitizeEbayInventoryItemPayload", () => {
  it("returns a clean Inventory API body", () => {
    const result = sanitizeEbayInventoryItemPayload({
      sku: "lw-abc_123",
      locale: "en-US",
      inventoryItem: {
        availability: { shipToLocationAvailability: { quantity: 1 } },
        condition: "USED_EXCELLENT",
        conditionDescription: "Good pre-owned condition.",
        product: {
          title: "Gray Tee",
          description: "Soft cotton tee",
          aspects: { Brand: ["Nike"], Color: ["Gray"] },
          imageUrls: ["https://cdn.example.com/1.jpg"],
        },
      },
    })
    assert.equal(result.sku, "lwabc123")
    assert.equal(result.locale, "en-US")
    assert.equal(result.inventoryItem.condition, "USED_EXCELLENT")
    assert.equal(result.blockingIssues.length, 0)
    assert.equal(result.inventoryItem.product.imageUrls.length, 1)
  })

  it("blocks when no valid images remain", () => {
    const result = sanitizeEbayInventoryItemPayload({
      sku: "SKU1",
      inventoryItem: {
        condition: "NEW",
        product: {
          title: "X",
          description: "Y",
          aspects: {},
          imageUrls: ["http://insecure.example/a.jpg"],
        },
      },
    })
    assert.ok(result.blockingIssues.length > 0)
  })
})

describe("diagnoseEbayInventoryPayload", () => {
  it("reports likely field issues for opaque 25001", () => {
    const lines = diagnoseEbayInventoryPayload({
      sku: "bad-sku!",
      locale: "en",
      inventoryItem: {
        availability: { shipToLocationAvailability: { quantity: 0 } },
        condition: "USED_EXCELLENT",
        product: {
          title: "",
          description: "",
          aspects: { Color: [""] },
          imageUrls: ["http://x"],
        },
      },
    })
    assert.ok(lines.some((l) => l.startsWith("sku:")))
    assert.ok(lines.some((l) => l.includes("locale")))
    assert.ok(lines.some((l) => l.includes("quantity")))
  })
})
