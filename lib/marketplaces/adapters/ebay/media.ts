import { createHash } from "crypto"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"
import { ensurePublicImageUrls } from "@/lib/marketplaces/images/ensure-public-urls"
import { ebayEnv } from "@/lib/marketplaces/adapters/ebay/oauth"

function redactUrlForLog(url: string): string {
  try {
    const u = new URL(url)
    // Drop query string (may contain signed tokens).
    return `${u.origin}${u.pathname.slice(0, 96)}${u.pathname.length > 96 ? "…" : ""}`
  } catch {
    return url.startsWith("data:") ? "data:[redacted]" : url.slice(0, 64)
  }
}

function fingerprintBytes(buffer: ArrayBuffer | Buffer): string {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  return createHash("sha256").update(buf.subarray(0, Math.min(buf.length, 4096))).digest("hex").slice(0, 16)
}

function isBlobOrLocalUrl(url: string) {
  const lower = url.trim().toLowerCase()
  return (
    lower.startsWith("blob:") ||
    lower.startsWith("filesystem:") ||
    lower.startsWith("file:") ||
    /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(lower)
  )
}

/** Signed / expiring / preview URLs must not be sent to eBay. */
function isEphemeralOrSignedUrl(url: string) {
  const lower = url.toLowerCase()
  try {
    const u = new URL(url)
    const q = u.search.toLowerCase()
    if (
      q.includes("token=") ||
      q.includes("signature=") ||
      q.includes("x-amz-") ||
      q.includes("expires=") ||
      q.includes("x-supabase")
    ) {
      return true
    }
    if (u.pathname.includes("/object/sign/") || u.pathname.includes("/storage/v1/object/sign/")) {
      return true
    }
    if (lower.includes("preview") && q.length > 0) return true
  } catch {
    return false
  }
  return false
}

type ImageProbe = {
  index: number
  urlPreview: string
  status: number
  contentType: string
  byteLength: number
  fingerprint: string
  finalUrlPreview: string
  redirectedToHtmlOrLogin: boolean
  ok: boolean
  error?: string
}

/**
 * Full GET probe: require HTTP 200 + image/* body. Follow redirects but reject
 * HTML/login/expired destinations.
 */
async function probeImageUrl(url: string, index: number): Promise<ImageProbe> {
  const base: ImageProbe = {
    index,
    urlPreview: redactUrlForLog(url),
    status: 0,
    contentType: "",
    byteLength: 0,
    fingerprint: "",
    finalUrlPreview: redactUrlForLog(url),
    redirectedToHtmlOrLogin: false,
    ok: false,
  }

  if (!url.startsWith("https://")) {
    return { ...base, error: "not_https" }
  }
  if (isBlobOrLocalUrl(url)) {
    return { ...base, error: "local_or_blob" }
  }
  if (isEphemeralOrSignedUrl(url)) {
    return { ...base, error: "signed_or_ephemeral" }
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { Accept: "image/*,*/*;q=0.8" },
    })
  } catch (err) {
    return {
      ...base,
      error: err instanceof Error ? `fetch_failed:${err.message}` : "fetch_failed",
    }
  }

  const finalUrl = response.url || url
  base.status = response.status
  base.finalUrlPreview = redactUrlForLog(finalUrl)
  const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
  base.contentType = contentType

  const buffer = Buffer.from(await response.arrayBuffer())
  base.byteLength = buffer.length
  base.fingerprint = fingerprintBytes(buffer)

  const looksHtml =
    contentType.includes("text/html") ||
    buffer.subarray(0, 64).toString("utf8").toLowerCase().includes("<!doctype html") ||
    buffer.subarray(0, 64).toString("utf8").toLowerCase().includes("<html")
  const loginish =
    /login|sign-in|signin|auth|expired/i.test(finalUrl) ||
    /login|sign in|access denied|jwt expired/i.test(buffer.subarray(0, 512).toString("utf8"))

  base.redirectedToHtmlOrLogin = Boolean(looksHtml || loginish)

  if (response.status !== 200) {
    return { ...base, error: `http_${response.status}` }
  }
  if (!contentType.startsWith("image/")) {
    return { ...base, error: `not_image_content_type:${contentType || "missing"}` }
  }
  if (base.redirectedToHtmlOrLogin) {
    return { ...base, error: "redirected_to_html_or_login" }
  }
  if (buffer.length < 100) {
    return { ...base, error: "image_too_small" }
  }

  return { ...base, ok: true }
}

function uniquePreserveOrder(urls: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const url of urls) {
    if (seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

/**
 * Build the exact product.imageUrls array for createOrReplaceInventoryItem.
 *
 * - Permanent public HTTPS only (no blob/data/signed/local)
 * - Same ListWise order, each URL once
 * - Server GET validates every URL (200 + image/*)
 * - Index 0 failure aborts publish with a clear first-photo error
 * - Sandbox TEMP diagnostic can swap index 0 and 1 to isolate position vs URL bugs
 */
export async function resolveEbayImageUrls(
  _accessToken: string,
  urls: string[]
): Promise<string[]> {
  const orderedSources = urls.map((u) => u.trim()).filter(Boolean).slice(0, 24)
  if (orderedSources.length === 0) {
    throw new MarketplaceError(
      "At least one listing photo is required to publish on eBay.",
      "ebay_images_required",
      400
    )
  }

  console.info("[ebay/images] TEMP listwise source order", {
    count: orderedSources.length,
    sources: orderedSources.map((url, index) => ({
      index,
      kind: url.startsWith("data:")
        ? "data"
        : url.startsWith("blob:")
          ? "blob"
          : isEphemeralOrSignedUrl(url)
            ? "signed_or_ephemeral"
            : url.startsWith("https://")
              ? "https"
              : url.startsWith("http://")
                ? "http"
                : "other",
      preview: redactUrlForLog(url),
    })),
  })

  // Hard-fail on blob/local before any conversion — never skip index 0.
  for (let i = 0; i < orderedSources.length; i++) {
    if (isBlobOrLocalUrl(orderedSources[i])) {
      throw new MarketplaceError(
        i === 0
          ? "The first listing photo is a local/blob URL and cannot be published. Save/re-upload photos before publishing."
          : `Listing photo #${i + 1} is a local/blob URL and cannot be published. Save/re-upload photos before publishing.`,
        "ebay_image_local",
        400
      )
    }
  }

  // Re-host anything that isn't already a permanent public HTTPS URL
  // (data URLs, http, signed/expiring https) into stable public storage URLs.
  const toHost: string[] = []
  for (let i = 0; i < orderedSources.length; i++) {
    const url = orderedSources[i]
    if (url.startsWith("data:")) {
      toHost.push(url)
      continue
    }
    if (
      url.startsWith("https://") &&
      !isEphemeralOrSignedUrl(url)
    ) {
      toHost.push(url)
      continue
    }
    // http or signed https → download bytes and convert to data URL for re-host.
    if (url.startsWith("http://") || url.startsWith("https://")) {
      let response: Response
      try {
        response = await fetch(url, { redirect: "follow" })
      } catch {
        throw new MarketplaceError(
          i === 0
            ? "The first listing photo could not be downloaded for permanent hosting."
            : `Listing photo #${i + 1} could not be downloaded for permanent hosting.`,
          "ebay_image_download_failed",
          400
        )
      }
      if (!response.ok) {
        throw new MarketplaceError(
          i === 0
            ? `The first listing photo download failed (HTTP ${response.status}).`
            : `Listing photo #${i + 1} download failed (HTTP ${response.status}).`,
          "ebay_image_download_failed",
          400
        )
      }
      const contentType = (response.headers.get("content-type") || "image/jpeg")
        .split(";")[0]
        .trim()
      if (!contentType.startsWith("image/")) {
        throw new MarketplaceError(
          i === 0
            ? `The first listing photo is not an image (content-type ${contentType}).`
            : `Listing photo #${i + 1} is not an image (content-type ${contentType}).`,
          "ebay_image_not_image",
          400
        )
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      toHost.push(`data:${contentType};base64,${buffer.toString("base64")}`)
      continue
    }
    throw new MarketplaceError(
      i === 0
        ? "The first listing photo has an unsupported URL scheme."
        : `Listing photo #${i + 1} has an unsupported URL scheme.`,
      "ebay_image_unsupported",
      400
    )
  }

  let permanent: string[]
  try {
    permanent = await ensurePublicImageUrls(toHost)
  } catch (err) {
    if (err instanceof MarketplaceError) {
      throw new MarketplaceError(
        `Could not create permanent public HTTPS image URLs: ${err.message}`,
        err.code,
        err.status
      )
    }
    throw err
  }

  permanent = uniquePreserveOrder(
    permanent.map((u) => u.trim()).filter(Boolean)
  ).slice(0, 24)

  if (permanent.length !== orderedSources.length) {
    console.info("[ebay/images] TEMP source→permanent count changed", {
      sourceCount: orderedSources.length,
      permanentCount: permanent.length,
    })
  }

  // Reject signed/ephemeral results (e.g. storage returned a signed link).
  for (let i = 0; i < permanent.length; i++) {
    const url = permanent[i]
    if (!url.startsWith("https://")) {
      throw new MarketplaceError(
        i === 0
          ? "The first listing photo did not resolve to a permanent public HTTPS URL."
          : `Listing photo #${i + 1} did not resolve to a permanent public HTTPS URL.`,
        "ebay_image_not_https",
        400
      )
    }
    if (isEphemeralOrSignedUrl(url)) {
      throw new MarketplaceError(
        i === 0
          ? "The first listing photo resolved to a signed/expiring URL. Use a permanent public HTTPS image URL."
          : `Listing photo #${i + 1} resolved to a signed/expiring URL. Use a permanent public HTTPS image URL.`,
        "ebay_image_signed",
        400
      )
    }
  }

  // TEMP diagnostic: swap first two images in Sandbox to isolate position vs URL bugs.
  // Enable with EBAY_TEMP_SWAP_FIRST_IMAGES=1 (default on in sandbox unless explicitly "0").
  const swapFlag = process.env.EBAY_TEMP_SWAP_FIRST_IMAGES
  const swapEnabled =
    permanent.length >= 2 &&
    (swapFlag === "1" ||
      (ebayEnv() === "sandbox" && swapFlag !== "0"))

  let payloadUrls = [...permanent]
  if (swapEnabled) {
    payloadUrls = [...permanent]
    const tmp = payloadUrls[0]
    payloadUrls[0] = payloadUrls[1]
    payloadUrls[1] = tmp
    console.info("[ebay/images] TEMP SWAP diagnostic active", {
      message:
        "Swapped image index 0 and 1 before validation/publish. If the broken gallery slot stays first, it is a position/payload bug; if the broken image follows this URL, it is a URL-generation bug.",
      index0Was: redactUrlForLog(permanent[0]),
      index1Was: redactUrlForLog(permanent[1]),
      index0Now: redactUrlForLog(payloadUrls[0]),
      index1Now: redactUrlForLog(payloadUrls[1]),
    })
  }

  const probes: ImageProbe[] = []
  for (let i = 0; i < payloadUrls.length; i++) {
    const probe = await probeImageUrl(payloadUrls[i], i)
    probes.push(probe)
    console.info("[ebay/images] TEMP image probe", {
      index: probe.index,
      status: probe.status,
      contentType: probe.contentType,
      byteLength: probe.byteLength,
      fingerprint: probe.fingerprint,
      urlPreview: probe.urlPreview,
      finalUrlPreview: probe.finalUrlPreview,
      redirectedToHtmlOrLogin: probe.redirectedToHtmlOrLogin,
      ok: probe.ok,
      error: probe.error || null,
    })

    if (!probe.ok) {
      const detail = probe.error || `http_${probe.status}`
      throw new MarketplaceError(
        i === 0
          ? `The first listing photo failed validation before publish (${detail}; content-type=${probe.contentType || "n/a"}; bytes=${probe.byteLength}). Re-upload the first photo as a permanent public HTTPS image.`
          : `Listing photo #${i + 1} failed validation before publish (${detail}; content-type=${probe.contentType || "n/a"}; bytes=${probe.byteLength}).`,
        i === 0 ? "ebay_image_first_invalid" : "ebay_image_invalid",
        400
      )
    }
  }

  if (probes.length >= 2) {
    console.info("[ebay/images] TEMP compare index0 vs index1", {
      index0: {
        fingerprint: probes[0].fingerprint,
        status: probes[0].status,
        contentType: probes[0].contentType,
        byteLength: probes[0].byteLength,
        urlPreview: probes[0].urlPreview,
      },
      index1: {
        fingerprint: probes[1].fingerprint,
        status: probes[1].status,
        contentType: probes[1].contentType,
        byteLength: probes[1].byteLength,
        urlPreview: probes[1].urlPreview,
      },
      sameFingerprint: probes[0].fingerprint === probes[1].fingerprint,
      sameUrl: payloadUrls[0] === payloadUrls[1],
      swapEnabled,
    })
  }

  console.info("[ebay/images] TEMP final product.imageUrls payload", {
    count: payloadUrls.length,
    uniqueCount: new Set(payloadUrls).size,
    exactlyOnce: payloadUrls.length === new Set(payloadUrls).size,
    order: payloadUrls.map((url, index) => ({
      index,
      preview: redactUrlForLog(url),
      fingerprint: probes[index]?.fingerprint,
    })),
  })

  return payloadUrls
}
