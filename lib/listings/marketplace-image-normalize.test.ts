import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import sharp from "sharp"
import {
  readJpegExifOrientation,
  readJpegStoredSize,
  type ExifOrientation,
} from "@/lib/listings/exif-orientation"
import {
  normalizeMarketplaceImage,
  normalizeMarketplaceImages,
} from "@/lib/listings/marketplace-image-normalize"
import { normalizeEbayListingPhotoBytes } from "@/lib/marketplaces/adapters/ebay/media"
import { normalizeImageOrientation } from "@/lib/listings/image-orientation"

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

describe("selected photo orientation is authoritative", () => {
  it("does not rotate the selected pixels when leftover EXIF 6 is present", async () => {
    const rgb = paintTopBottom(32, 64)
    const selected = await jpegFromRgb(32, 64, rgb, 6)
    assert.equal(readJpegExifOrientation(selected) ?? 6, 6)
    assert.deepEqual(readJpegStoredSize(selected), { width: 32, height: 64 })

    const out = await normalizeMarketplaceImage(selected, "image/jpeg")
    assert.equal(out.strategy, "strip-exif-keep-pixels")
    assert.equal(out.width, 32)
    assert.equal(out.height, 64)
    assert.equal(effectiveOrientation(out.buffer), 1)
    assertColor(await samplePixel(out.buffer, 8, 8), RED, "selected top")
    assertColor(await samplePixel(out.buffer, 8, 56), BLUE, "selected bottom")
  })

  it("does not rotate leftover EXIF 3 or 8 either", async () => {
    for (const orientation of [3, 8] as const) {
      const rgb = paintTopBottom(40, 48)
      const selected = await jpegFromRgb(40, 48, rgb, orientation)
      const out = await normalizeMarketplaceImage(selected, "image/jpeg")
      assert.equal(out.width, 40, `exif ${orientation} width`)
      assert.equal(out.height, 48, `exif ${orientation} height`)
      assert.equal(effectiveOrientation(out.buffer), 1)
      assertColor(
        await samplePixel(out.buffer, 8, 8),
        RED,
        `exif ${orientation} top stays top`
      )
    }
  })

  it("does not rotate orientation-1 portrait or landscape from aspect ratio", async () => {
    const portrait = await jpegFromRgb(32, 64, paintTopBottom(32, 64), 1)
    const p = await normalizeMarketplaceImage(portrait, "image/jpeg")
    assert.equal(p.changed, false)
    assert.equal(p.width, 32)
    assert.equal(p.height, 64)

    const landscape = await jpegFromRgb(64, 32, paintTopBottom(64, 32), 1)
    const l = await normalizeMarketplaceImage(landscape, "image/jpeg")
    assert.equal(l.changed, false)
    assert.equal(l.width, 64)
    assert.equal(l.height, 32)
  })
})

describe("upload preview = stored = eBay bytes", () => {
  it("initial upload strips leftover EXIF without rotating selected pixels", async () => {
    const selected = await jpegFromRgb(32, 64, paintTopBottom(32, 64), 6)
    const blob = new Blob([selected], { type: "image/jpeg" })
    const oriented = await normalizeImageOrientation(blob, "gallery.jpg")
    const uploaded = Buffer.from(await oriented.blob.arrayBuffer())

    assert.equal(readJpegExifOrientation(uploaded) ?? 1, 1)
    assert.deepEqual(readJpegStoredSize(uploaded), { width: 32, height: 64 })
    assertColor(await samplePixel(uploaded, 8, 8), RED, "upload top")
    assertColor(await samplePixel(uploaded, 8, 56), BLUE, "upload bottom")

    const stored = await normalizeMarketplaceImage(uploaded, "image/jpeg")
    assert.equal(stored.changed, false)
    assert.equal(stored.width, 32)
    assert.equal(stored.height, 64)
    assertColor(await samplePixel(stored.buffer, 8, 8), RED, "stored top")
  })

  it("keeps every gallery photo's selected dimensions and top-edge marker", async () => {
    const files = [
      await jpegFromRgb(64, 40, paintTopBottom(64, 40), 1),
      await jpegFromRgb(32, 64, paintTopBottom(32, 64), 6),
      await jpegFromRgb(36, 60, paintTopBottom(36, 60), 8),
      await jpegFromRgb(80, 48, paintTopBottom(80, 48), 3),
      await jpegFromRgb(40, 40, paintTopBottom(40, 40), 1),
      await jpegFromRgb(48, 72, paintTopBottom(48, 72), 1),
    ]
    const results = await normalizeMarketplaceImages(
      files.map((buffer) => ({ buffer, contentType: "image/jpeg" }))
    )
    const expected = [
      [64, 40],
      [32, 64],
      [36, 60],
      [80, 48],
      [40, 40],
      [48, 72],
    ]
    assert.equal(results.length, 6)
    for (const [index, image] of results.entries()) {
      assert.equal(image.width, expected[index][0], `photo ${index} width`)
      assert.equal(image.height, expected[index][1], `photo ${index} height`)
      assert.equal(effectiveOrientation(image.buffer), 1)
      assertColor(
        await samplePixel(image.buffer, 6, 6),
        RED,
        `photo ${index} selected top`
      )
    }
  })
})

describe("eBay path does not rotate after upload", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("passes through already-preserved pixels for every photo", async () => {
    const selected = await jpegFromRgb(32, 64, paintTopBottom(32, 64), 6)
    const stored = await normalizeMarketplaceImage(selected, "image/jpeg")
    const sources = [
      "https://cdn.listwise.test/listing-images/u/originals/a.jpg",
      "https://cdn.listwise.test/listing-images/u/originals/b.jpg",
    ]
    const byUrl = new Map([
      [sources[0], stored.buffer],
      [sources[1], stored.buffer],
    ])
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const body = byUrl.get(String(input))
      if (!body) return new Response("missing", { status: 404 })
      return new Response(body, {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      })
    }) as typeof fetch

    const prepared = await normalizeEbayListingPhotoBytes(sources)
    assert.equal(prepared.length, 2)
    for (const photo of prepared) {
      assert.equal(photo.normalized.changed, false)
      assert.equal(photo.normalized.width, 32)
      assert.equal(photo.normalized.height, 64)
      assertColor(await samplePixel(photo.normalized.buffer, 8, 8), RED, "ebay top")
    }
  })
})
