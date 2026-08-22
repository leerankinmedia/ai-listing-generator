import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import sharp from "sharp"
import {
  jpegNeedsOrientationBake,
  jpegWithExifOrientation,
  readJpegExifOrientation,
  readJpegStoredSize,
  applyExifOrientationToRgb,
  type ExifOrientation,
} from "@/lib/listings/exif-orientation"
import {
  normalizeMarketplaceImage,
  normalizeMarketplaceImages,
} from "@/lib/listings/marketplace-image-normalize"
import { normalizeEbayListingPhotoBytes } from "@/lib/marketplaces/adapters/ebay/media"

const RED = { r: 220, g: 16, b: 16 }
const BLUE = { r: 16, g: 16, b: 220 }

type Rgb = { r: number; g: number; b: number }

function paintTopBottom(width: number, height: number): Buffer {
  const data = Buffer.alloc(width * height * 3)
  const mid = Math.floor(height / 2)
  for (let y = 0; y < height; y++) {
    const color = y < mid ? RED : BLUE
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      data[i] = color.r
      data[i + 1] = color.g
      data[i + 2] = color.b
    }
  }
  return data
}

async function jpegFromRgb(
  width: number,
  height: number,
  rgb: Buffer,
  orientation?: ExifOrientation
): Promise<Buffer> {
  let pipeline = sharp(rgb, { raw: { width, height, channels: 3 } }).jpeg({
    quality: 100,
    chromaSubsampling: "4:4:4",
  })
  if (orientation && orientation !== 1) {
    pipeline = pipeline.withMetadata({ orientation })
  }
  return pipeline.toBuffer()
}

async function samplePixel(
  buffer: Buffer,
  x: number,
  y: number
): Promise<Rgb> {
  const { data, info } = await sharp(buffer)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const i = (y * info.width + x) * info.channels
  return { r: data[i], g: data[i + 1], b: data[i + 2] }
}

function assertColor(actual: Rgb, expected: Rgb, label: string) {
  assert.ok(
    Math.abs(actual.r - expected.r) < 40 &&
      Math.abs(actual.g - expected.g) < 40 &&
      Math.abs(actual.b - expected.b) < 40,
    `${label}: expected ~${JSON.stringify(expected)} got ${JSON.stringify(actual)}`
  )
}

function effectiveOrientation(buffer: Buffer): number {
  return readJpegExifOrientation(buffer) ?? 1
}

describe("marketplace image orientation bake-in", () => {
  it("parses injected JPEG EXIF orientation tags", async () => {
    const base = await jpegFromRgb(32, 64, paintTopBottom(32, 64))
    assert.equal(readJpegExifOrientation(base), null)
    assert.deepEqual(readJpegStoredSize(base), { width: 32, height: 64 })
    const tagged = Buffer.from(jpegWithExifOrientation(base, 6))
    assert.equal(readJpegExifOrientation(tagged), 6)
    assert.equal(jpegNeedsOrientationBake(tagged), true)
    assert.deepEqual(readJpegStoredSize(tagged), { width: 32, height: 64 })
  })

  it("keeps a native portrait JPEG (orientation 1) unrotated", async () => {
    const stored = await jpegFromRgb(32, 64, paintTopBottom(32, 64), 1)
    const result = await normalizeMarketplaceImage(stored, "image/jpeg")
    assert.equal(result.changed, false)
    assert.equal(result.width, 32)
    assert.equal(result.height, 64)
    assert.equal(effectiveOrientation(result.buffer), 1)
    assertColor(await samplePixel(result.buffer, 8, 8), RED, "portrait top")
    assertColor(await samplePixel(result.buffer, 8, 56), BLUE, "portrait bottom")
  })

  it("bakes EXIF 6 so visual top matches what ListWise <img> showed", async () => {
    // Seller-visible portrait: red on top, blue on bottom (32x64).
    // Phone stores that as landscape + Orientation 6 (90 CW to display).
    const visualWidth = 32
    const visualHeight = 64
    const visualRgb = paintTopBottom(visualWidth, visualHeight)
    const stored = applyExifOrientationToRgb(
      visualRgb,
      visualWidth,
      visualHeight,
      3,
      8
    )
    const jpeg = await jpegFromRgb(stored.width, stored.height, Buffer.from(stored.data), 6)
    assert.equal(readJpegExifOrientation(jpeg) ?? 6, 6)
    assert.deepEqual(readJpegStoredSize(jpeg), {
      width: stored.width,
      height: stored.height,
    })

    const result = await normalizeMarketplaceImage(jpeg, "image/jpeg")
    assert.equal(result.changed, true)
    assert.equal(result.orientationWas, 6)
    assert.equal(result.width, visualWidth)
    assert.equal(result.height, visualHeight)
    assert.equal(effectiveOrientation(result.buffer), 1)

    const meta = await sharp(result.buffer).metadata()
    assert.ok(!meta.orientation || meta.orientation === 1)

    assertColor(await samplePixel(result.buffer, 8, 8), RED, "exif6 visual top")
    assertColor(await samplePixel(result.buffer, 8, 56), BLUE, "exif6 visual bottom")
  })

  it("normalizes every photo in a multi-image gallery, not just the cover", async () => {
    const cover = await jpegFromRgb(48, 32, paintTopBottom(48, 32), 1)
    const tag = await jpegFromRgb(64, 32, paintTopBottom(64, 32), 6)
    const back = await jpegFromRgb(32, 48, paintTopBottom(32, 48), 8)
    const side = await jpegFromRgb(40, 40, paintTopBottom(40, 40), 3)

    const results = await normalizeMarketplaceImages([
      { buffer: cover, contentType: "image/jpeg" },
      { buffer: tag, contentType: "image/jpeg" },
      { buffer: back, contentType: "image/jpeg" },
      { buffer: side, contentType: "image/jpeg" },
    ])

    assert.equal(results.length, 4)
    for (const [index, image] of results.entries()) {
      assert.equal(
        effectiveOrientation(image.buffer),
        1,
        `photo ${index} still has EXIF orientation ${effectiveOrientation(image.buffer)}`
      )
    }

    assert.equal(results[0].changed, false)
    assert.equal(results[0].width, 48)
    assert.equal(results[0].height, 32)

    assert.equal(results[1].changed, true)
    assert.equal(results[1].orientationWas, 6)
    assert.equal(results[1].width, 32)
    assert.equal(results[1].height, 64)

    assert.equal(results[2].changed, true)
    assert.equal(results[2].orientationWas, 8)
    assert.equal(results[2].width, 48)
    assert.equal(results[2].height, 32)

    assert.equal(results[3].changed, true)
    assert.equal(results[3].orientationWas, 3)
    assert.equal(results[3].width, 40)
    assert.equal(results[3].height, 40)
  })

  it("round-trips seller-visible pixels for EXIF 2, 3, 6, and 8", async () => {
    const visualWidth = 32
    const visualHeight = 48
    const visualRgb = paintTopBottom(visualWidth, visualHeight)
    const inverse: Record<2 | 3 | 6 | 8, 2 | 3 | 6 | 8> = {
      2: 2,
      3: 3,
      6: 8,
      8: 6,
    }

    for (const orientation of [2, 3, 6, 8] as const) {
      const stored = applyExifOrientationToRgb(
        visualRgb,
        visualWidth,
        visualHeight,
        3,
        inverse[orientation]
      )
      const jpeg = await jpegFromRgb(
        stored.width,
        stored.height,
        Buffer.from(stored.data),
        orientation
      )
      const result = await normalizeMarketplaceImage(jpeg, "image/jpeg")
      assert.equal(result.changed, true, `orientation ${orientation} should bake`)
      assert.equal(result.width, visualWidth, `orientation ${orientation} width`)
      assert.equal(result.height, visualHeight, `orientation ${orientation} height`)
      assert.equal(effectiveOrientation(result.buffer), 1)
      assertColor(
        await samplePixel(result.buffer, 8, 8),
        RED,
        `orientation ${orientation} visual top`
      )
      assertColor(
        await samplePixel(result.buffer, 8, visualHeight - 8),
        BLUE,
        `orientation ${orientation} visual bottom`
      )
    }
  })
})

describe("eBay publish path uses baked bytes for every photo", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("preserves seller order and bakes additional photos, not only image[0]", async () => {
    const cover = await jpegFromRgb(48, 32, paintTopBottom(48, 32), 1)
    const extra6 = await jpegFromRgb(64, 32, paintTopBottom(64, 32), 6)
    const extra8 = await jpegFromRgb(32, 48, paintTopBottom(32, 48), 8)
    const extra3 = await jpegFromRgb(40, 40, paintTopBottom(40, 40), 3)

    const sources = [
      "https://cdn.listwise.test/listing-images/u/originals/cover.jpg",
      "https://cdn.listwise.test/listing-images/u/originals/tag.jpg",
      "https://cdn.listwise.test/listing-images/u/originals/back.jpg",
      "https://cdn.listwise.test/listing-images/u/originals/side.jpg",
    ]
    const byUrl = new Map<string, Buffer>([
      [sources[0], cover],
      [sources[1], extra6],
      [sources[2], extra8],
      [sources[3], extra3],
    ])

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      const body = byUrl.get(url)
      if (!body) {
        return new Response("missing", { status: 404 })
      }
      return new Response(body, {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      })
    }) as typeof fetch

    const prepared = await normalizeEbayListingPhotoBytes(sources)
    assert.equal(prepared.length, 4)
    assert.deepEqual(
      prepared.map((p) => p.sourceUrl),
      sources
    )

    assert.equal(prepared[0].normalized.changed, false)
    assert.equal(prepared[0].keepPublicUrl, sources[0])
    assert.equal(effectiveOrientation(prepared[0].normalized.buffer), 1)

    assert.equal(prepared[1].normalized.changed, true)
    assert.equal(prepared[1].normalized.orientationWas, 6)
    assert.equal(effectiveOrientation(prepared[1].normalized.buffer), 1)
    assert.equal(prepared[1].normalized.width, 32)
    assert.equal(prepared[1].normalized.height, 64)

    assert.equal(prepared[2].normalized.changed, true)
    assert.equal(prepared[2].normalized.orientationWas, 8)
    assert.equal(effectiveOrientation(prepared[2].normalized.buffer), 1)

    assert.equal(prepared[3].normalized.changed, true)
    assert.equal(prepared[3].normalized.orientationWas, 3)
    assert.equal(effectiveOrientation(prepared[3].normalized.buffer), 1)

    assertColor(
      await samplePixel(prepared[1].normalized.buffer, 8, 16),
      BLUE,
      "publish extra photo left after 90 CW"
    )
  })

  it("bakes data-URL photos the same way as hosted URLs (no cover special case)", async () => {
    const extra = await jpegFromRgb(64, 32, paintTopBottom(64, 32), 6)
    const dataUrl = `data:image/jpeg;base64,${extra.toString("base64")}`
    const prepared = await normalizeEbayListingPhotoBytes([dataUrl])
    assert.equal(prepared[0].normalized.changed, true)
    assert.equal(effectiveOrientation(prepared[0].normalized.buffer), 1)
    assert.equal(prepared[0].keepPublicUrl, null)
  })
})
