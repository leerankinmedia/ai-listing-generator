import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { afterEach, describe, it } from "node:test"
import sharp from "sharp"
import {
  readJpegExifOrientation,
  readJpegStoredSize,
  type ExifOrientation,
} from "@/lib/listings/exif-orientation"
import { normalizeImageOrientation } from "@/lib/listings/image-orientation"
import {
  normalizeMarketplaceImage,
  normalizeMarketplaceImages,
} from "@/lib/listings/marketplace-image-normalize"
import { normalizeEbayListingPhotoBytes } from "@/lib/marketplaces/adapters/ebay/media"

const RED = { r: 220, g: 16, b: 16 }
const BLUE = { r: 16, g: 16, b: 220 }

type Rgb = { r: number; g: number; b: number }

/**
 * Camera-JPEG reproduction: stored landscape pixels with EXIF 6.
 * Phone gallery / file picker honor EXIF → portrait, red at visual top.
 * ListWise used to strip EXIF + set image-orientation:none → landscape.
 */
function paintLeftRight(width: number, height: number): Buffer {
  const data = Buffer.alloc(width * height * 3)
  const mid = Math.floor(width / 2)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = x < mid ? RED : BLUE
      const i = (y * width + x) * 3
      data[i] = color.r
      data[i + 1] = color.g
      data[i + 2] = color.b
    }
  }
  return data
}

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

/** How the phone picker / default <img> shows a JPEG (honor EXIF). Test-only. */
async function pickerDisplay(buffer: Buffer): Promise<{
  width: number
  height: number
  top: Rgb
  bottom: Rgb
}> {
  const { data, info } = await sharp(buffer)
    .rotate()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const channels = info.channels
  const topI = 0
  const bottomI = ((info.height - 1) * info.width) * channels
  return {
    width: info.width,
    height: info.height,
    top: { r: data[topI], g: data[topI + 1], b: data[topI + 2] },
    bottom: {
      r: data[bottomI],
      g: data[bottomI + 1],
      b: data[bottomI + 2],
    },
  }
}

function assertColor(actual: Rgb, expected: Rgb, label: string) {
  assert.ok(
    Math.abs(actual.r - expected.r) < 40 &&
      Math.abs(actual.g - expected.g) < 40 &&
      Math.abs(actual.b - expected.b) < 40,
    `${label}: expected ~${JSON.stringify(expected)} got ${JSON.stringify(actual)}`
  )
}

function assertSamePickerDisplay(
  actual: Awaited<ReturnType<typeof pickerDisplay>>,
  expected: Awaited<ReturnType<typeof pickerDisplay>>,
  label: string
) {
  assert.equal(actual.width, expected.width, `${label} width`)
  assert.equal(actual.height, expected.height, `${label} height`)
  assertColor(actual.top, expected.top, `${label} visual top`)
  assertColor(actual.bottom, expected.bottom, `${label} visual bottom`)
}

async function ingestBytes(source: Buffer): Promise<Buffer> {
  const blob = new Blob([source], { type: "image/jpeg" })
  const oriented = await normalizeImageOrientation(blob, "gallery.jpg")
  return Buffer.from(await oriented.blob.arrayBuffer())
}

describe("upload preview must not override picker orientation", () => {
  it("does not force image-orientation: none on listing photos", () => {
    const css = readFileSync("app/globals.css", "utf8")
    assert.equal(css.includes("image-orientation"), false)
    for (const path of [
      "components/listings/image-uploader.tsx",
      "components/listings/listings-grid.tsx",
      "components/listings/pre-publish-review.tsx",
      "components/inventory/inventory-page.tsx",
    ]) {
      const src = readFileSync(path, "utf8")
      assert.equal(
        src.includes("image-orientation"),
        false,
        `${path} must not disable EXIF display`
      )
    }
  })
})

describe("picker-upright camera JPEG (EXIF 6) through the whole pipeline", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("source, ListWise ingest, stored, and eBay-bound bytes all render the same way", async () => {
    // Stored 64×32 landscape, red on the LEFT. EXIF 6 = 90° CW → picker
    // shows 32×64 portrait with red at the TOP — the jeans-upright case.
    const source = await jpegFromRgb(64, 32, paintLeftRight(64, 32), 6)
    assert.equal(readJpegExifOrientation(source), 6)
    assert.deepEqual(readJpegStoredSize(source), { width: 64, height: 32 })

    const picker = await pickerDisplay(source)
    assert.equal(picker.width, 32, "picker visual width")
    assert.equal(picker.height, 64, "picker visual height")
    assertColor(picker.top, RED, "picker visual top")
    assertColor(picker.bottom, BLUE, "picker visual bottom")

    const ingested = await ingestBytes(source)
    assert.equal(readJpegExifOrientation(ingested), 6, "ingest must keep EXIF")
    assert.deepEqual(readJpegStoredSize(ingested), { width: 64, height: 32 })
    assertSamePickerDisplay(await pickerDisplay(ingested), picker, "ingest")

    const stored = await normalizeMarketplaceImage(ingested, "image/jpeg")
    assert.equal(stored.changed, false)
    assert.equal(stored.strategy, "passthrough")
    assert.equal(readJpegExifOrientation(stored.buffer), 6, "storage must keep EXIF")
    assert.equal(stored.width, 64)
    assert.equal(stored.height, 32)
    assertSamePickerDisplay(await pickerDisplay(stored.buffer), picker, "stored")

    const url = "https://cdn.listwise.test/listing-images/u/originals/jeans.jpg"
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input) !== url) return new Response("missing", { status: 404 })
      return new Response(stored.buffer, {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      })
    }) as typeof fetch

    const prepared = await normalizeEbayListingPhotoBytes([url])
    assert.equal(prepared.length, 1)
    assert.equal(prepared[0].normalized.changed, false)
    assert.equal(readJpegExifOrientation(prepared[0].normalized.buffer), 6)
    assertSamePickerDisplay(
      await pickerDisplay(prepared[0].normalized.buffer),
      picker,
      "ebay"
    )
  })

  it("keeps every mixed-gallery photo's picker display, including EXIF 3/8", async () => {
    const files = [
      await jpegFromRgb(64, 40, paintTopBottom(64, 40), 1),
      await jpegFromRgb(64, 32, paintLeftRight(64, 32), 6),
      await jpegFromRgb(36, 60, paintTopBottom(36, 60), 8),
      await jpegFromRgb(80, 48, paintTopBottom(80, 48), 3),
      await jpegFromRgb(40, 40, paintTopBottom(40, 40), 1),
      await jpegFromRgb(48, 72, paintTopBottom(48, 72), 1),
    ]
    const pickers = await Promise.all(files.map((file) => pickerDisplay(file)))
    const ingested = await Promise.all(files.map((file) => ingestBytes(file)))
    const stored = await normalizeMarketplaceImages(
      ingested.map((buffer) => ({ buffer, contentType: "image/jpeg" }))
    )
    assert.equal(stored.length, 6)
    for (const [index, image] of stored.entries()) {
      assert.equal(image.changed, false, `photo ${index} unchanged`)
      assert.equal(
        readJpegExifOrientation(image.buffer) ?? 1,
        readJpegExifOrientation(files[index]) ?? 1,
        `photo ${index} EXIF kept`
      )
      assertSamePickerDisplay(
        await pickerDisplay(image.buffer),
        pickers[index],
        `photo ${index}`
      )
    }
  })
})

describe("orientation-1 photos are not rotated from aspect ratio", () => {
  it("keeps portrait and landscape stored size and picker display", async () => {
    const portrait = await jpegFromRgb(32, 64, paintTopBottom(32, 64), 1)
    const landscape = await jpegFromRgb(64, 32, paintTopBottom(64, 32), 1)
    for (const [label, source] of [
      ["portrait", portrait],
      ["landscape", landscape],
    ] as const) {
      const picker = await pickerDisplay(source)
      const out = await normalizeMarketplaceImage(source, "image/jpeg")
      assert.equal(out.changed, false, label)
      assert.equal(readJpegExifOrientation(out.buffer) ?? 1, 1, label)
      assertSamePickerDisplay(await pickerDisplay(out.buffer), picker, label)
    }
  })
})
