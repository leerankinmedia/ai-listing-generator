import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  applyExifOrientationToRgb,
  jpegWithExifOrientation,
  readJpegExifOrientation,
  readJpegStoredSize,
  stripJpegExifKeepPixels,
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

  it("rotates unique pixels for every EXIF tag without using aspect-ratio heuristics", () => {
    // 2x3 stored:
    // A B C
    // D E F
    const width = 3
    const height = 2
    const src = Uint8Array.from([
      1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0, 0, 5, 0, 0, 6, 0, 0,
    ])
    const at = (
      data: Uint8Array,
      w: number,
      x: number,
      y: number
    ) => data[(y * w + x) * 3]

    const o1 = applyExifOrientationToRgb(src, width, height, 3, 1)
    assert.equal(o1.width, 3)
    assert.equal(o1.height, 2)
    assert.equal(at(o1.data, 3, 0, 0), 1)
    assert.equal(at(o1.data, 3, 2, 1), 6)

    const o6 = applyExifOrientationToRgb(src, width, height, 3, 6)
    assert.equal(o6.width, 2)
    assert.equal(o6.height, 3)
    assert.equal(at(o6.data, 2, 0, 0), 4)
    assert.equal(at(o6.data, 2, 1, 0), 1)
    assert.equal(at(o6.data, 2, 0, 2), 6)
    assert.equal(at(o6.data, 2, 1, 2), 3)

    const o8 = applyExifOrientationToRgb(src, width, height, 3, 8)
    assert.equal(o8.width, 2)
    assert.equal(o8.height, 3)
    assert.equal(at(o8.data, 2, 0, 0), 3)
    assert.equal(at(o8.data, 2, 1, 0), 6)

    const o3 = applyExifOrientationToRgb(src, width, height, 3, 3)
    assert.equal(o3.width, 3)
    assert.equal(o3.height, 2)
    assert.equal(at(o3.data, 3, 0, 0), 6)
    assert.equal(at(o3.data, 3, 2, 1), 1)

    const o2 = applyExifOrientationToRgb(src, width, height, 3, 2)
    assert.equal(at(o2.data, 3, 0, 0), 3)
    assert.equal(at(o2.data, 3, 2, 0), 1)
  })
})

describe("visual pixel strategy (never extra-rotate)", () => {
  it("does not treat a swapped HTMLImage size as a reason to rotate leftover EXIF", () => {
    const strategy = visualPixelStrategy({
      orientation: 6,
      stored: { width: 32, height: 64 },
      decodedIgnoringExif: { width: 32, height: 64 },
      decodedAsHtmlImage: { width: 64, height: 32 },
    })
    assert.equal(strategy.action, "strip-exif-keep-pixels")
  })

  it("strips leftover EXIF without rotating when display matches stored pixels", () => {
    const strategy = visualPixelStrategy({
      orientation: 6,
      stored: { width: 32, height: 64 },
      decodedIgnoringExif: { width: 32, height: 64 },
      decodedAsHtmlImage: { width: 32, height: 64 },
    })
    assert.equal(strategy.action, "strip-exif-keep-pixels")
  })

  it("strips EXIF without rotating when there is no browser display decoder", () => {
    const strategy = visualPixelStrategy({
      orientation: 6,
      stored: { width: 32, height: 64 },
      decodedIgnoringExif: { width: 32, height: 64 },
    })
    assert.equal(strategy.action, "strip-exif-keep-pixels")
  })

  it("does not rotate orientation-1 portrait or landscape from aspect ratio", () => {
    assert.equal(
      visualPixelStrategy({
        orientation: 1,
        stored: { width: 32, height: 64 },
        decodedIgnoringExif: { width: 32, height: 64 },
        decodedAsHtmlImage: { width: 32, height: 64 },
      }).action,
      "passthrough"
    )
    assert.equal(
      visualPixelStrategy({
        orientation: 1,
        stored: { width: 64, height: 32 },
        decodedIgnoringExif: { width: 64, height: 32 },
        decodedAsHtmlImage: { width: 64, height: 32 },
      }).action,
      "passthrough"
    )
  })
})

describe("strip JPEG EXIF without rotating pixels", () => {
  it("drops leftover Orientation and keeps stored width/height", () => {
    // Minimal 1x1 JPEG (SOI + SOF0 1x1 + EOI). Dimensions come from SOF0.
    const jpeg = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x40, 0x00, 0x20, 0x01,
      0x01, 0x11, 0x00, 0xff, 0xd9,
    ])
    const tagged = jpegWithExifOrientation(jpeg, 6)
    assert.equal(readJpegExifOrientation(tagged), 6)
    assert.deepEqual(readJpegStoredSize(tagged), { width: 32, height: 64 })

    const stripped = stripJpegExifKeepPixels(tagged)
    assert.equal(readJpegExifOrientation(stripped), null)
    assert.deepEqual(readJpegStoredSize(stripped), { width: 32, height: 64 })
  })
})
