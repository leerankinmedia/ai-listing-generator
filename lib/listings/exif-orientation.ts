/**
 * JPEG EXIF orientation helpers shared by the browser bake-in path and the
 * server marketplace normalizer.
 *
 * Orientation is the EXIF tag (1–8). We never treat the display string or
 * width>height as a reason to rotate: portrait/landscape/tag photos stay as
 * the seller saw them once pixels are physically rotated to match EXIF.
 */

export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export function isExifOrientation(value: number): value is ExifOrientation {
  return Number.isInteger(value) && value >= 1 && value <= 8
}

export function orientationSwapsSize(orientation: number): boolean {
  return orientation >= 5 && orientation <= 8
}

export function visualSizeForOrientation(
  storedWidth: number,
  storedHeight: number,
  orientation: number
): { width: number; height: number } {
  if (orientationSwapsSize(orientation)) {
    return { width: storedHeight, height: storedWidth }
  }
  return { width: storedWidth, height: storedHeight }
}

function readU16(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  if (offset + 1 >= bytes.length) return 0
  return littleEndian
    ? bytes[offset] | (bytes[offset + 1] << 8)
    : (bytes[offset] << 8) | bytes[offset + 1]
}

function readU32(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  if (offset + 3 >= bytes.length) return 0
  return littleEndian
    ? bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)
    : (bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]
}

/** Stored pixel size from SOF, ignoring EXIF. */
export function readJpegStoredSize(
  input: Uint8Array | ArrayBuffer
): { width: number; height: number } | null {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null

  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1]
    if (marker === 0xda || marker === 0xd9) break
    if (marker === 0x00 || marker === 0xff) {
      offset += 1
      continue
    }
    const size = (bytes[offset + 2] << 8) | bytes[offset + 3]
    if (size < 2 || offset + 2 + size > bytes.length) break
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    if (isSof) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6]
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8]
      if (width > 0 && height > 0) return { width, height }
      return null
    }
    offset += 2 + size
  }
  return null
}

function orientationFromTiff(bytes: Uint8Array, tiffOffset: number): ExifOrientation | null {
  if (tiffOffset + 8 >= bytes.length) return null
  const b0 = bytes[tiffOffset]
  const b1 = bytes[tiffOffset + 1]
  const littleEndian = b0 === 0x49 && b1 === 0x49
  const bigEndian = b0 === 0x4d && b1 === 0x4d
  if (!littleEndian && !bigEndian) return null
  const magic = readU16(bytes, tiffOffset + 2, littleEndian)
  if (magic !== 42) return null

  const ifd0 = tiffOffset + readU32(bytes, tiffOffset + 4, littleEndian)
  if (ifd0 + 2 >= bytes.length) return null
  const count = readU16(bytes, ifd0, littleEndian)
  for (let i = 0; i < count; i++) {
    const entry = ifd0 + 2 + i * 12
    if (entry + 12 > bytes.length) break
    const tag = readU16(bytes, entry, littleEndian)
    if (tag !== 0x0112) continue
    const type = readU16(bytes, entry + 2, littleEndian)
    const valueCount = readU32(bytes, entry + 4, littleEndian)
    if (valueCount < 1) continue
    let value: number
    if (type === 3) {
      value = readU16(bytes, entry + 8, littleEndian)
    } else if (type === 4) {
      value = readU32(bytes, entry + 8, littleEndian)
    } else {
      value = readU16(bytes, entry + 8, littleEndian)
    }
    return isExifOrientation(value) ? value : null
  }
  return null
}

/**
 * Read EXIF Orientation from a JPEG. Returns 1 when the tag is missing
 * (pixels already match visual orientation) and null when the buffer is
 * not a JPEG / has no parseable APP1.
 */
export function readJpegExifOrientation(
  input: Uint8Array | ArrayBuffer
): ExifOrientation | null {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null

  let offset = 2
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1]
    if (marker === 0xda || marker === 0xd9) break
    if (marker === 0x00 || marker === 0xff) {
      offset += 1
      continue
    }
    const size = (bytes[offset + 2] << 8) | bytes[offset + 3]
    if (size < 2 || offset + 2 + size > bytes.length) break
    if (marker === 0xe1) {
      const start = offset + 4
      const header = String.fromCharCode(
        bytes[start] || 0,
        bytes[start + 1] || 0,
        bytes[start + 2] || 0,
        bytes[start + 3] || 0,
        bytes[start + 4] || 0,
        bytes[start + 5] || 0
      )
      if (header === "Exif\u0000\u0000") {
        const found = orientationFromTiff(bytes, start + 6)
        if (found) return found
      }
    }
    offset += 2 + size
  }
  return null
}

export function jpegNeedsOrientationBake(input: Uint8Array | ArrayBuffer): boolean {
  const orientation = readJpegExifOrientation(input)
  return orientation !== null && orientation !== 1
}

/**
 * Map stored pixel (x, y) onto the visual canvas for the given EXIF tag.
 * `out` is RGB or RGBA packed left-to-right, top-to-bottom.
 */
export function applyExifOrientationToRgb(
  src: Uint8Array,
  width: number,
  height: number,
  channels: 3 | 4,
  orientation: number
): { data: Uint8Array; width: number; height: number } {
  const visual = visualSizeForOrientation(width, height, orientation)
  const out = new Uint8Array(visual.width * visual.height * channels)
  const srcAt = (x: number, y: number) => (y * width + x) * channels
  const dstAt = (x: number, y: number) => (y * visual.width + x) * channels

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let dx = x
      let dy = y
      switch (orientation) {
        case 2:
          dx = width - 1 - x
          dy = y
          break
        case 3:
          dx = width - 1 - x
          dy = height - 1 - y
          break
        case 4:
          dx = x
          dy = height - 1 - y
          break
        case 5:
          dx = y
          dy = x
          break
        case 6:
          dx = height - 1 - y
          dy = x
          break
        case 7:
          dx = height - 1 - y
          dy = width - 1 - x
          break
        case 8:
          dx = y
          dy = width - 1 - x
          break
        default:
          dx = x
          dy = y
      }
      const s = srcAt(x, y)
      const d = dstAt(dx, dy)
      for (let c = 0; c < channels; c++) out[d + c] = src[s + c]
    }
  }
  return { data: out, width: visual.width, height: visual.height }
}

/** Canvas 2D transform that maps stored pixels onto a visual-sized canvas. */
export function applyExifOrientationToCanvas(
  ctx: {
    translate: (x: number, y: number) => void
    scale: (x: number, y: number) => void
    rotate: (rad: number) => void
  },
  storedWidth: number,
  storedHeight: number,
  orientation: number
) {
  switch (orientation) {
    case 2:
      ctx.translate(storedWidth, 0)
      ctx.scale(-1, 1)
      break
    case 3:
      ctx.translate(storedWidth, storedHeight)
      ctx.rotate(Math.PI)
      break
    case 4:
      ctx.translate(0, storedHeight)
      ctx.scale(1, -1)
      break
    case 5:
      ctx.rotate(0.5 * Math.PI)
      ctx.scale(1, -1)
      break
    case 6:
      ctx.rotate(0.5 * Math.PI)
      ctx.translate(0, -storedHeight)
      break
    case 7:
      ctx.rotate(0.5 * Math.PI)
      ctx.translate(storedWidth, -storedHeight)
      ctx.scale(-1, 1)
      break
    case 8:
      ctx.rotate(-0.5 * Math.PI)
      ctx.translate(-storedWidth, 0)
      break
    default:
      break
  }
}

export type PixelSize = { width: number; height: number }

export function sizesEqual(
  a: PixelSize | null | undefined,
  b: PixelSize | null | undefined
): boolean {
  return Boolean(a && b && a.width === b.width && a.height === b.height)
}

/**
 * How to produce the pixels the phone gallery shows.
 *
 * Android/iOS galleries apply EXIF Orientation once. ListWise must persist
 * those same pixels (not the raw sensor buffer) and then drop the tag.
 *
 * - `use-display-pixels`: browser decoder already applied EXIF (size or
 *   pixels differ from raw). Paint that bitmap 1:1 — do NOT apply EXIF again.
 * - `apply-exif-once`: decoder ignored EXIF (same size as stored). Apply the
 *   EXIF transform once so preview matches the phone gallery, then strip the tag.
 * - `passthrough`: orientation 1 / no work.
 *
 * Never rotate because width>height. Never apply EXIF twice.
 * Never strip EXIF while leaving unrotated sensor pixels — that is what made
 * ListWise preview disagree with the phone gallery.
 */
export type VisualPixelStrategy =
  | { action: "passthrough" }
  | { action: "apply-exif-once" }
  | { action: "use-display-pixels" }

export function visualPixelStrategy(input: {
  orientation: number
  stored?: PixelSize | null
  decodedIgnoringExif?: PixelSize | null
  decodedAsHtmlImage?: PixelSize | null
  /** True when from-image / <img> pixels differ from raw despite same size (e.g. EXIF 3). */
  displayPixelsDifferFromRaw?: boolean
}): VisualPixelStrategy {
  const orientation = input.orientation || 1
  const raw = input.decodedIgnoringExif || input.stored
  const display = input.decodedAsHtmlImage

  if (display && raw && !sizesEqual(display, raw)) {
    return { action: "use-display-pixels" }
  }

  if (input.displayPixelsDifferFromRaw) {
    return { action: "use-display-pixels" }
  }

  if (orientation > 1) {
    return { action: "apply-exif-once" }
  }

  return { action: "passthrough" }
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/**
 * Remove JPEG EXIF APP1 segments (including Orientation) without touching
 * Huffman/SOS pixel data. Missing orientation is treated as 1.
 */
export function stripJpegExifKeepPixels(jpeg: Uint8Array): Uint8Array {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg
  const parts: Uint8Array[] = [jpeg.subarray(0, 2)]
  let offset = 2
  while (offset + 1 < jpeg.length) {
    if (jpeg[offset] !== 0xff) {
      parts.push(jpeg.subarray(offset))
      break
    }
    const marker = jpeg[offset + 1]
    if (marker === 0xda || marker === 0xd9) {
      parts.push(jpeg.subarray(offset))
      break
    }
    if (marker === 0x00 || marker === 0xff) {
      parts.push(jpeg.subarray(offset, offset + 1))
      offset += 1
      continue
    }
    if (offset + 3 >= jpeg.length) {
      parts.push(jpeg.subarray(offset))
      break
    }
    const size = (jpeg[offset + 2] << 8) | jpeg[offset + 3]
    const next = offset + 2 + size
    if (size < 2 || next > jpeg.length) {
      parts.push(jpeg.subarray(offset))
      break
    }
    const isExifApp1 =
      marker === 0xe1 &&
      offset + 9 < jpeg.length &&
      jpeg[offset + 4] === 0x45 &&
      jpeg[offset + 5] === 0x78 &&
      jpeg[offset + 6] === 0x69 &&
      jpeg[offset + 7] === 0x66 &&
      jpeg[offset + 8] === 0x00 &&
      jpeg[offset + 9] === 0x00
    if (!isExifApp1) {
      parts.push(jpeg.subarray(offset, next))
    }
    offset = next
  }
  return concatBytes(parts)
}

/**
 * Insert or replace a tiny APP1 EXIF Orientation tag after SOI.
 * Used for fixtures; production encode strips EXIF by re-encoding pixels.
 */
export function jpegWithExifOrientation(
  jpeg: Uint8Array,
  orientation: ExifOrientation
): Uint8Array {
  if (jpeg.length < 2 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
    throw new Error("jpegWithExifOrientation requires a JPEG buffer")
  }
  const app1 = buildExifApp1(orientation)
  let offset = 2
  if (
    jpeg.length > 4 &&
    jpeg[2] === 0xff &&
    jpeg[3] === 0xe1
  ) {
    const size = (jpeg[4] << 8) | jpeg[5]
    offset = 4 + size
  }
  const out = new Uint8Array(2 + app1.length + (jpeg.length - offset))
  out[0] = 0xff
  out[1] = 0xd8
  out.set(app1, 2)
  out.set(jpeg.subarray(offset), 2 + app1.length)
  return out
}

function buildExifApp1(orientation: ExifOrientation): Uint8Array {
  // APP1 length (2) + "Exif\0\0" (6) + TIFF (8) + IFD0 count (2) + entry (12) + next IFD (4)
  const payloadLen = 2 + 6 + 8 + 2 + 12 + 4
  const bytes = new Uint8Array(payloadLen)
  bytes[0] = 0xff
  bytes[1] = 0xe1
  const length = payloadLen - 2
  bytes[2] = (length >> 8) & 0xff
  bytes[3] = length & 0xff
  bytes.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 4) // Exif\0\0
  const tiff = 10
  bytes[tiff] = 0x49
  bytes[tiff + 1] = 0x49
  bytes[tiff + 2] = 0x2a
  bytes[tiff + 3] = 0x00
  bytes[tiff + 4] = 8
  bytes[tiff + 5] = 0
  bytes[tiff + 6] = 0
  bytes[tiff + 7] = 0
  const ifd = tiff + 8
  bytes[ifd] = 1
  bytes[ifd + 1] = 0
  const entry = ifd + 2
  bytes[entry] = 0x12
  bytes[entry + 1] = 0x01
  bytes[entry + 2] = 3
  bytes[entry + 3] = 0
  bytes[entry + 4] = 1
  bytes[entry + 5] = 0
  bytes[entry + 6] = 0
  bytes[entry + 7] = 0
  bytes[entry + 8] = orientation
  bytes[entry + 9] = 0
  bytes[entry + 10] = 0
  bytes[entry + 11] = 0
  return bytes
}
