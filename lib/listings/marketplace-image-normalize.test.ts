import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import sharp from "sharp"
import {
  applyExifOrientationToRgb,
  jpegWithExifOrientation,
  readJpegExifOrientation,
  readJpegStoredSize,
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

/**
 * Phone-gallery visual: apply EXIF once to stored pixels.
 * ListWise preview after upload must match this, not the raw sensor buffer.
 */
function phoneGalleryRgb(
  storedRgb: Buffer,
  width: number,
  height: number,
  orientation: number
) {
  return applyExifOrientationToRgb(
    storedRgb,
    width,
    height,
    3,
    orientation
  )
}

describe("ListWise upload preview matches phone gallery EXIF 1/3/6/8", () => {
  it("orientation 1 portrait stays portrait (no aspect-ratio rotate)", async () => {
    const rgb = paintTopBottom(32, 64)
    const stored = await jpegFromRgb(32, 64, rgb, 1)
    const preview = await normalizeMarketplaceImage(stored, "image/jpeg")
    assert.equal(preview.changed, false)
    assert.equal(preview.width, 32)
    assert.equal(preview.height, 64)
    assert.equal(effectiveOrientation(preview.buffer), 1)
    assertColor(await samplePixel(preview.buffer, 8, 8), RED, "o1 top")
    assertColor(await samplePixel(preview.buffer, 8, 56), BLUE, "o1 bottom")
  })

  for (const orientation of [3, 6, 8] as const) {
    it(`bakes EXIF ${orientation} to the phone-gallery visual and strips the tag`, async () => {
      const storedW = orientation === 3 ? 40 : 64
      const storedH = orientation === 3 ? 40 : 32
      const storedRgb = paintTopBottom(storedW, storedH)
      const stored = await jpegFromRgb(storedW, storedH, storedRgb, orientation)
      assert.equal(readJpegExifOrientation(stored) ?? orientation, orientation)
      assert.deepEqual(readJpegStoredSize(stored), {
        width: storedW,
        height: storedH,
      })

      const gallery = phoneGalleryRgb(storedRgb, storedW, storedH, orientation)
      const preview = await normalizeMarketplaceImage(stored, "image/jpeg")
      assert.equal(preview.strategy, "apply-exif-once")
      assert.equal(preview.width, gallery.width)
      assert.equal(preview.height, gallery.height)
      assert.equal(effectiveOrientation(preview.buffer), 1)

      const galleryTop = gallery.data.subarray(0, 3)
      const expectRedTop = galleryTop[0] > galleryTop[2]
      assertColor(
        await samplePixel(preview.buffer, 6, 6),
        expectRedTop ? RED : BLUE,
        `exif${orientation} preview matches gallery top`
      )

      const again = await normalizeMarketplaceImage(preview.buffer, "image/jpeg")
      assert.equal(again.changed, false)
      assert.equal(again.width, preview.width)
      assert.equal(again.height, preview.height)
    })
  }

  it("stripping EXIF without baking would NOT match the phone gallery (the prior bug)", async () => {
    const storedRgb = paintTopBottom(64, 32)
    const stored = await jpegFromRgb(64, 32, storedRgb, 6)
    const gallery = phoneGalleryRgb(storedRgb, 64, 32, 6)
    assert.equal(gallery.width, 32)
    assert.equal(gallery.height, 64)
    assert.notEqual(readJpegStoredSize(stored)?.width, gallery.width)
  })
})

describe("mixed jeans/tag gallery: preview matches phone gallery for every photo", () => {
  it("keeps seller order and phone-gallery orientation on all six photos", async () => {
    const tagStored = paintTopBottom(64, 32)
    const waistStored = paintTopBottom(64, 32)
    const jeansStored = paintTopBottom(64, 32)
    const foldedStored = paintTopBottom(64, 32)

    const files = [
      { name: "tag", buffer: await jpegFromRgb(64, 32, tagStored, 6) },
      { name: "waistband", buffer: await jpegFromRgb(64, 32, waistStored, 8) },
      { name: "jeans", buffer: await jpegFromRgb(64, 32, jeansStored, 6) },
      { name: "folded-a", buffer: await jpegFromRgb(64, 32, foldedStored, 6) },
      { name: "folded-b", buffer: await jpegFromRgb(64, 32, foldedStored, 6) },
      { name: "folded-c", buffer: await jpegFromRgb(64, 32, foldedStored, 1) },
    ]

    const results = await normalizeMarketplaceImages(
      files.map((file) => ({ buffer: file.buffer, contentType: "image/jpeg" }))
    )
    assert.equal(results.length, 6)

    const tagGallery = phoneGalleryRgb(tagStored, 64, 32, 6)
    assert.equal(results[0].width, tagGallery.width)
    assert.equal(results[0].height, tagGallery.height)
    assert.equal(effectiveOrientation(results[0].buffer), 1)

    const waistGallery = phoneGalleryRgb(waistStored, 64, 32, 8)
    assert.equal(results[1].width, waistGallery.width)
    assert.equal(results[1].height, waistGallery.height)

    assert.equal(results[5].width, 64)
    assert.equal(results[5].height, 32)
    assert.equal(results[5].changed, false)

    for (const [index, image] of results.entries()) {
      assert.equal(effectiveOrientation(image.buffer), 1, `photo ${index} tag`)
    }
  })
})

describe("eBay/generate receive the same baked preview bytes", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("does not rotate a second time after upload bake", async () => {
    const storedRgb = paintTopBottom(64, 32)
    const uploaded = await jpegFromRgb(64, 32, storedRgb, 6)
    const preview = await normalizeMarketplaceImage(uploaded, "image/jpeg")

    const sources = [
      "https://cdn.listwise.test/listing-images/u/originals/cover.jpg",
      "https://cdn.listwise.test/listing-images/u/originals/tag.jpg",
    ]
    const byUrl = new Map<string, Buffer>([
      [sources[0], preview.buffer],
      [sources[1], preview.buffer],
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
    assert.deepEqual(
      prepared.map((p) => p.sourceUrl),
      sources
    )
    for (const photo of prepared) {
      assert.equal(photo.normalized.changed, false)
      assert.equal(photo.normalized.width, preview.width)
      assert.equal(photo.normalized.height, preview.height)
      assert.equal(effectiveOrientation(photo.normalized.buffer), 1)
    }
  })
})
