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
  it("sends eBay only the baked derivative, never the original HTTPS URL", () => {
    const src = readFileSync("lib/marketplaces/adapters/ebay/media.ts", "utf8")
    assert.match(src, /marketplaceImageToDataUrl\(photo\.normalized\)/)
    assert.equal(
      /keepPublicUrl/.test(src),
      false,
      "eBay must not reuse the original public URL of an EXIF-dependent file"
    )
    assert.match(
      src,
      /Bake ListWise-preview pixels into an EXIF-free derivative/
    )
  })

  it("does not statically import sharp into the publish module graph", () => {
    const src = readFileSync("lib/listings/marketplace-image-normalize.ts", "utf8")
    assert.equal(
      /^\s*import\s+sharp\s+from\s+["']sharp["']/m.test(src),
      false,
      "top-level sharp import 500s /api/listings/publish as HTML when the native binary is missing"
    )
    assert.match(src, /import\(["']sharp["']\)/)
  })

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

/** How eBay sees a JPEG if it ignores EXIF (raw stored pixels). Test-only. */
async function ebayIgnoredExifDisplay(buffer: Buffer): Promise<{
  width: number
  height: number
  top: Rgb
  bottom: Rgb
}> {
  const { data, info } = await sharp(buffer, { autoOrient: false })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const channels = info.channels
  const topI = 0
  const bottomI = (info.height - 1) * info.width * channels
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

describe("ListWise original stays EXIF-dependent; eBay gets a baked derivative", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("Samsung/Android EXIF 6: ListWise preview matches eBay bytes with EXIF ignored", async () => {
    // Stored 64×32 landscape, red on the LEFT. EXIF 6 = 90° CW → ListWise
    // <img> shows 32×64 portrait with red at the TOP. eBay was showing the
    // landscape matrix because it ignored/reapplied EXIF differently.
    const source = await jpegFromRgb(64, 32, paintLeftRight(64, 32), 6)
    assert.equal(readJpegExifOrientation(source), 6)
    assert.deepEqual(readJpegStoredSize(source), { width: 64, height: 32 })

    const listwise = await pickerDisplay(source)
    assert.equal(listwise.width, 32)
    assert.equal(listwise.height, 64)
    assertColor(listwise.top, RED, "ListWise visual top")
    assertColor(listwise.bottom, BLUE, "ListWise visual bottom")

    const ingested = await ingestBytes(source)
    assert.equal(readJpegExifOrientation(ingested), 6, "original ingest keeps EXIF")
    assert.deepEqual(readJpegStoredSize(ingested), { width: 64, height: 32 })
    assertSamePickerDisplay(await pickerDisplay(ingested), listwise, "ingest")

    const originalCopy = Buffer.from(ingested)
    const derivative = await normalizeMarketplaceImage(ingested, "image/jpeg")
    assert.deepEqual(
      Buffer.from(ingested),
      originalCopy,
      "stored original bytes must stay untouched"
    )
    assert.equal(derivative.strategy, "bake-display-pixels")
    assert.equal(derivative.changed, true)
    assert.equal(derivative.orientationWas, 6)
    assert.equal(readJpegExifOrientation(derivative.buffer), null)
    assert.equal(derivative.width, 32)
    assert.equal(derivative.height, 64)

    const ebaySees = await ebayIgnoredExifDisplay(derivative.buffer)
    assertSamePickerDisplay(ebaySees, listwise, "eBay EXIF-ignored vs ListWise")

    const url = "https://cdn.listwise.test/listing-images/u/originals/jeans.jpg"
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input) !== url) return new Response("missing", { status: 404 })
      return new Response(ingested, {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      })
    }) as typeof fetch

    const prepared = await normalizeEbayListingPhotoBytes([url])
    assert.equal(prepared.length, 1)
    assert.equal(prepared[0].normalized.strategy, "bake-display-pixels")
    assert.equal(readJpegExifOrientation(prepared[0].normalized.buffer) ?? 1, 1)
    assertSamePickerDisplay(
      await ebayIgnoredExifDisplay(prepared[0].normalized.buffer),
      listwise,
      "eBay handoff"
    )
  })

  it("bakes all 6 mixed-gallery photos so EXIF-ignored decode matches ListWise", async () => {
    const files = [
      await jpegFromRgb(64, 40, paintTopBottom(64, 40), 1),
      await jpegFromRgb(64, 32, paintLeftRight(64, 32), 6),
      await jpegFromRgb(36, 60, paintTopBottom(36, 60), 8),
      await jpegFromRgb(80, 48, paintTopBottom(80, 48), 3),
      await jpegFromRgb(40, 40, paintTopBottom(40, 40), 1),
      await jpegFromRgb(48, 72, paintTopBottom(48, 72), 1),
    ]
    const listwise = await Promise.all(files.map((file) => pickerDisplay(file)))
    const ingested = await Promise.all(files.map((file) => ingestBytes(file)))
    const derivatives = await normalizeMarketplaceImages(
      ingested.map((buffer) => ({ buffer, contentType: "image/jpeg" }))
    )
    assert.equal(derivatives.length, 6)
    for (const [index, image] of derivatives.entries()) {
      assert.equal(image.strategy, "bake-display-pixels", `photo ${index}`)
      assert.equal(readJpegExifOrientation(image.buffer), null, `photo ${index} EXIF`)
      assert.equal(
        readJpegExifOrientation(ingested[index]) ?? 1,
        readJpegExifOrientation(files[index]) ?? 1,
        `photo ${index} original EXIF preserved`
      )
      assertSamePickerDisplay(
        await ebayIgnoredExifDisplay(image.buffer),
        listwise[index],
        `photo ${index}`
      )
    }
  })
})

describe("orientation-1 photos are not rotated from aspect ratio", () => {
  it("keeps portrait and landscape visual size after the eBay bake", async () => {
    const portrait = await jpegFromRgb(32, 64, paintTopBottom(32, 64), 1)
    const landscape = await jpegFromRgb(64, 32, paintTopBottom(64, 32), 1)
    for (const [label, source] of [
      ["portrait", portrait],
      ["landscape", landscape],
    ] as const) {
      const listwise = await pickerDisplay(source)
      const out = await normalizeMarketplaceImage(source, "image/jpeg")
      assert.equal(readJpegExifOrientation(out.buffer) ?? 1, 1, label)
      assertSamePickerDisplay(
        await ebayIgnoredExifDisplay(out.buffer),
        listwise,
        label
      )
    }
  })
})
