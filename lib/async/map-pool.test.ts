import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { mapPool } from "@/lib/async/map-pool"

describe("mapPool", () => {
  it("preserves input order with bounded concurrency", async () => {
    const seen: number[] = []
    const out = await mapPool([3, 1, 2], 2, async (n) => {
      seen.push(n)
      await new Promise((resolve) => setTimeout(resolve, n * 10))
      return n * 10
    })
    assert.deepEqual(out, [30, 10, 20])
    assert.equal(seen.length, 3)
  })

  it("returns an empty array for empty input", async () => {
    const out = await mapPool([], 4, async (n: number) => n)
    assert.deepEqual(out, [])
  })

  it("does not leave sibling rejections unhandled", async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason)
    }
    process.on("unhandledRejection", onUnhandled)
    try {
      await assert.rejects(
        mapPool([1, 2, 3], 3, async (n) => {
          if (n !== 1) throw new Error(`fail-${n}`)
          await new Promise((resolve) => setTimeout(resolve, 20))
          return n
        }),
        /fail-/
      )
      await new Promise((resolve) => setTimeout(resolve, 30))
      assert.equal(unhandled.length, 0)
    } finally {
      process.off("unhandledRejection", onUnhandled)
    }
  })
})
