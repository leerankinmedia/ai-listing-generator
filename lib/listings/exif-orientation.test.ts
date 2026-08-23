import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  visualPixelStrategy,
  visualSizeForOrientation,
} from "@/lib/listings/exif-orientation"

describe("EXIF orientation mapping", () => {
  it("does not swap portrait/landscape from width and height alone", () => {
    assert.deepEqual(visualSizeForOrientation(100, 200, 1), {
      width: 100,
      height: 200,
    })
    assert.deepEqual(visualSizeForOrientation(200, 100, 1), {
      width: 200,
      height: 100,
    })
    assert.deepEqual(visualSizeForOrientation(100, 200, 6), {
      width: 200,
      height: 100,
    })
  })
})

describe("visual pixel strategy (never transform)", () => {
  it("passthrough even when leftover EXIF would swap HTMLImage size", () => {
    assert.equal(
      visualPixelStrategy({
        orientation: 6,
        stored: { width: 64, height: 32 },
        decodedIgnoringExif: { width: 64, height: 32 },
        decodedAsHtmlImage: { width: 32, height: 64 },
      }).action,
      "passthrough"
    )
  })

  it("passthrough leftover EXIF 6/8 and orientation-1 portrait/landscape", () => {
    for (const orientation of [1, 3, 6, 8]) {
      assert.equal(
        visualPixelStrategy({
          orientation,
          stored: { width: 32, height: 64 },
          decodedIgnoringExif: { width: 32, height: 64 },
        }).action,
        "passthrough",
        `exif ${orientation}`
      )
    }
  })
})
