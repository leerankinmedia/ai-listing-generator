import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import sharp from "sharp"
import {
  jpegWithExifOrientation,
  readJpegExifOrientation,
  readJpegStoredSize,
  stripJpegExifKeepPixels,
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
  const { data, info } = await sharp(buffer, { autoOrient: false })
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

describe("strip EXIF without rotating pixels", () => {
  it("parses injected JPEG EXIF orientation tags then strips them losslessly", async () => {
    const base = await jpegFromRgb(32, 64, paintTopBottom(32, 64))
    assert.equal(readJpegExifOrientation(base), null)
    assert.deepEqual(readJpegStoredSize(base), { width: 32, height: 64 })
    const tagged = Buffer.from(jpegWithExifOrientation(base, 6))
    assert.equal(readJpegExifOrientation(tagged), 6)
    const stripped = stripJpegExifKeepPixels(tagged)
    assert.equal(readJpegExifOrientation(stripped), null)
    assert.deepEqual(readJpegStoredSize(stripped), { width: 32, height: 64 })
    assertColor(await samplePixel(Buffer.from(stripped), 8, 8), RED, "top after strip")
    assertColor(await samplePixel(Buffer.from(stripped), 8, 56), BLUE, "bottom after strip")
  })
})

describe("marketplace image orientation — do not re-apply EXIF", () => {
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

  it("does not rotate already-visual pixels that still have stale EXIF 6", async () => {
    // Seller-visible portrait (red on top). iOS/browser already baked pixels
    // but left Orientation=6. ListWise <img> shows this correctly; sharp.rotate()
    // would swap it to landscape.
    const visual = await jpegFromRgb(32, 64, paintTopBottom(32, 64), 6)
    assert.equal(readJpegExifOrientation(visual) ?? 6, 6)
    assert.deepEqual(readJpegStoredSize(visual), { width: 32, height: 64 })

    const result = await normalizeMarketplaceImage(visual, "image/jpeg")
    assert.equal(result.strategy, "keep-pixels-strip-exif")
    assert.equal(result.width, 32)
    assert.equal(result.height, 64)
    assert.equal(effectiveOrientation(result.buffer), 1)
    assertColor(await samplePixel(result.buffer, 8, 8), RED, "stale-exif6 visual top")
    assertColor(await samplePixel(result.buffer, 8, 56), BLUE, "stale-exif6 visual bottom")
  })

  it("does not rotate already-visual landscape leftover EXIF 8", async () => {
    const visual = await jpegFromRgb(64, 32, paintTopBottom(64, 32), 8)
    const result = await normalizeMarketplaceImage(visual, "image/jpeg")
    assert.equal(result.width, 64)
    assert.equal(result.height, 32)
    assert.equal(effectiveOrientation(result.buffer), 1)
    assertColor(await samplePixel(result.buffer, 8, 8), RED, "stale-exif8 top")
    assertColor(await samplePixel(result.buffer, 8, 24), BLUE, "stale-exif8 bottom")
  })
})

describe("mixed gallery matching production jeans/tag photos", () => {
  it("preserves ListWise visual pixels for every photo handed to eBay", async () => {
    const cover = await jpegFromRgb(64, 40, paintTopBottom(64, 40), 1)
    const folded = await jpegFromRgb(80, 48, paintTopBottom(80, 48), 1)
    const tag = await jpegFromRgb(32, 64, paintTopBottom(32, 64), 6)
    const waistband = await jpegFromRgb(36, 60, paintTopBottom(36, 60), 8)
    const front = await jpegFromRgb(64, 40, paintTopBottom(64, 40), 1)
    const back = await jpegFromRgb(64, 40, paintTopBottom(64, 40), 3)

    const results = await normalizeMarketplaceImages([
      { buffer: cover, contentType: "image/jpeg" },
      { buffer: folded, contentType: "image/jpeg" },
      { buffer: tag, contentType: "image/jpeg" },
      { buffer: waistband, contentType: "image/jpeg" },
      { buffer: front, contentType: "image/jpeg" },
      { buffer: back, contentType: "image/jpeg" },
    ])

    assert.equal(results.length, 6)
    const expected = [
      { w: 64, h: 40 },
      { w: 80, h: 48 },
      { w: 32, h: 64 },
      { w: 36, h: 60 },
      { w: 64, h: 40 },
      { w: 64, h: 40 },
    ]
    for (const [index, image] of results.entries()) {
      assert.equal(
        effectiveOrientation(image.buffer),
        1,
        `photo ${index} orientation`
      )
      assert.equal(image.width, expected[index].w, `photo ${index} width`)
      assert.equal(image.height, expected[index].h, `photo ${index} height`)
      assertColor(
        await samplePixel(image.buffer, 6, 6),
        RED,
        `photo ${index} visual top marker`
      )
    }
  })
})

describe("eBay publish path uses ListWise pixels for every photo", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("does not apply a second EXIF rotate to additional photos", async () => {
    const cover = await jpegFromRgb(64, 40, paintTopBottom(64, 40), 1)
    const tag = await jpegFromRgb(32, 64, paintTopBottom(32, 64), 6)
    const waistband = await jpegFromRgb(36, 60, paintTopBottom(36, 60), 8)
    const folded = await jpegFromRgb(80, 48, paintTopBottom(80, 48), 1)

    const sources = [
      "https://cdn.listwise.test/listing-images/u/originals/cover.jpg",
      "https://cdn.listwise.test/listing-images/u/originals/tag.jpg",
      "https://cdn.listwise.test/listing-images/u/originals/waistband.jpg",
      "https://cdn.listwise.test/listing-images/u/originals/folded.jpg",
    ]
    const byUrl = new Map<string, Buffer>([
      [sources[0], cover],
      [sources[1], tag],
      [sources[2], waistband],
      [sources[3], folded],
    ])

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      const body = byUrl.get(url)
      if (!body) return new Response("missing", { status: 404 })
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

    assert.equal(prepared[0].normalized.width, 64)
    assert.equal(prepared[0].normalized.height, 40)
    assert.equal(prepared[1].normalized.width, 32)
    assert.equal(prepared[1].normalized.height, 64)
    assert.equal(prepared[2].normalized.width, 36)
    assert.equal(prepared[2].normalized.height, 60)
    assert.equal(prepared[3].normalized.width, 80)
    assert.equal(prepared[3].normalized.height, 48)

    for (const [index, photo] of prepared.entries()) {
      assert.equal(
        effectiveOrientation(photo.normalized.buffer),
        1,
        `publish photo ${index} still has EXIF orientation`
      )
      assertColor(
        await samplePixel(photo.normalized.buffer, 6, 6),
        RED,
        `publish photo ${index} visual top`
      )
    }
  })
})
