import { MarketplaceError } from "@/lib/marketplaces/adapters/types"
import { ebayEnv } from "@/lib/marketplaces/adapters/ebay/oauth"

function ebayMediaBase() {
  // Media API uses apim host in production docs; sandbox mirrors api.sandbox.
  return ebayEnv() === "sandbox"
    ? "https://apim.sandbox.ebay.com"
    : "https://apim.ebay.com"
}

function parseDataUrl(dataUrl: string): { contentType: string; buffer: Buffer; filename: string } {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl)
  if (!match) {
    throw new MarketplaceError(
      "Invalid data-URL image. Re-upload photos and try again.",
      "ebay_image_invalid",
      400
    )
  }
  const contentType = match[1]
  const buffer = Buffer.from(match[2], "base64")
  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
      ? "webp"
      : contentType.includes("gif")
        ? "gif"
        : "jpg"
  return { contentType, buffer, filename: `listwise.${ext}` }
}

function redactUrlForLog(url: string): string {
  try {
    const u = new URL(url)
    return `${u.origin}${u.pathname.slice(0, 80)}${u.pathname.length > 80 ? "…" : ""}`
  } catch {
    return url.slice(0, 64)
  }
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

/**
 * Upload a listing image to eBay Picture Services via Commerce Media API.
 * Accepts http(s) URLs (createImageFromUrl) or data URLs (createImageFromFile).
 */
export async function uploadEbayImage(
  accessToken: string,
  imageUrl: string
): Promise<string> {
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    const response = await fetch(
      `${ebayMediaBase()}/commerce/media/v1_beta/image/create_image_from_url`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ imageUrl }),
      }
    )
    const payload = (await response.json().catch(() => ({}))) as {
      imageUrl?: string
      errors?: Array<{ message?: string }>
      message?: string
    }
    if (!response.ok || !payload.imageUrl) {
      throw new MarketplaceError(
        payload.errors?.[0]?.message ||
          payload.message ||
          `eBay image URL upload failed (${response.status})`,
        "ebay_media_url_failed",
        response.status || 502
      )
    }
    return payload.imageUrl
  }

  if (!imageUrl.startsWith("data:")) {
    throw new MarketplaceError(
      "Unsupported image source for eBay. Use http(s) or data-URL images.",
      "ebay_image_unsupported",
      400
    )
  }

  const { contentType, buffer, filename } = parseDataUrl(imageUrl)
  const form = new FormData()
  form.append(
    "image",
    new Blob([new Uint8Array(buffer)], { type: contentType }),
    filename
  )

  const response = await fetch(
    `${ebayMediaBase()}/commerce/media/v1_beta/image/create_image_from_file`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      body: form,
    }
  )

  const payload = (await response.json().catch(() => ({}))) as {
    imageUrl?: string
    errors?: Array<{ message?: string }>
    message?: string
  }

  if ((!response.ok && response.status !== 201) || !payload.imageUrl) {
    // Some Media API responses put EPS URL only after getImage; try Location header flow.
    const location = response.headers.get("location")
    if (location && (response.ok || response.status === 201)) {
      const imageId = location.split("/").pop()
      if (imageId) {
        const details = await fetch(
          `${ebayMediaBase()}/commerce/media/v1_beta/image/${imageId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/json",
            },
          }
        )
        const detailJson = (await details.json().catch(() => ({}))) as {
          imageUrl?: string
        }
        if (detailJson.imageUrl) return detailJson.imageUrl
      }
    }
    throw new MarketplaceError(
      payload.errors?.[0]?.message ||
        payload.message ||
        `eBay image file upload failed (${response.status})`,
      "ebay_media_file_failed",
      response.status || 502
    )
  }

  return payload.imageUrl
}

async function verifyPublicHttpsImage(url: string, index: number): Promise<void> {
  if (!url.startsWith("https://")) {
    throw new MarketplaceError(
      `Listing photo #${index + 1} is not a public HTTPS URL after upload. Re-upload the photo and try again.`,
      "ebay_image_not_https",
      400
    )
  }
  if (isBlobOrLocalUrl(url)) {
    throw new MarketplaceError(
      `Listing photo #${index + 1} points to a local/blob URL and cannot be published to eBay.`,
      "ebay_image_local",
      400
    )
  }

  let response: Response
  try {
    response = await fetch(url, { method: "HEAD", redirect: "follow" })
    // Some CDNs reject HEAD — fall back to a ranged GET.
    if (response.status === 405 || response.status === 403 || response.status === 400) {
      response = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        redirect: "follow",
      })
    }
  } catch {
    throw new MarketplaceError(
      `Listing photo #${index + 1} could not be reached over HTTPS. Re-upload the photo and try again.`,
      "ebay_image_unreachable",
      400
    )
  }

  if (!response.ok && response.status !== 206) {
    throw new MarketplaceError(
      `Listing photo #${index + 1} failed accessibility check (HTTP ${response.status}). Re-upload the photo and try again.`,
      "ebay_image_inaccessible",
      400
    )
  }
}

/**
 * Resolve listing photos to public HTTPS eBay EPS URLs for inventory_item.product.imageUrls.
 * Preserves ListWise order. Never silently drops the first image — invalid sources error out.
 */
export async function resolveEbayImageUrls(
  accessToken: string,
  urls: string[]
): Promise<string[]> {
  const ordered = urls.map((u) => u.trim()).filter(Boolean).slice(0, 24)
  if (ordered.length === 0) {
    throw new MarketplaceError(
      "At least one listing photo is required to publish on eBay.",
      "ebay_images_required",
      400
    )
  }

  console.info("[ebay/images] TEMP source order", {
    count: ordered.length,
    kinds: ordered.map((url, index) => ({
      index,
      kind: url.startsWith("data:")
        ? "data"
        : url.startsWith("blob:")
          ? "blob"
          : url.startsWith("https://")
            ? "https"
            : url.startsWith("http://")
              ? "http"
              : "other",
      preview: url.startsWith("data:") ? "data:[redacted]" : redactUrlForLog(url),
    })),
  })

  // Reject blob/local up front — do not skip/reorder past a bad first photo.
  for (let i = 0; i < ordered.length; i++) {
    const url = ordered[i]
    if (isBlobOrLocalUrl(url)) {
      throw new MarketplaceError(
        `Listing photo #${i + 1} is a local/blob URL and cannot be published. Re-upload photos so they are saved before publishing.`,
        "ebay_image_local",
        400
      )
    }
    if (
      !url.startsWith("https://") &&
      !url.startsWith("http://") &&
      !url.startsWith("data:")
    ) {
      throw new MarketplaceError(
        `Listing photo #${i + 1} has an unsupported URL. Re-upload the photo and try again.`,
        "ebay_image_unsupported",
        400
      )
    }
  }

  const resolved: string[] = []
  for (let i = 0; i < ordered.length; i++) {
    const source = ordered[i]
    try {
      const epsUrl = await uploadEbayImage(accessToken, source)
      if (!epsUrl?.startsWith("https://")) {
        throw new MarketplaceError(
          `Listing photo #${i + 1} did not return a public HTTPS eBay image URL.`,
          "ebay_image_eps_invalid",
          502
        )
      }
      resolved.push(epsUrl)
    } catch (err) {
      if (err instanceof MarketplaceError) {
        throw new MarketplaceError(
          i === 0
            ? `The first listing photo could not be prepared for eBay: ${err.message}`
            : `Listing photo #${i + 1} could not be prepared for eBay: ${err.message}`,
          err.code,
          err.status
        )
      }
      throw err
    }
  }

  // Verify the first inventory image is publicly reachable before publish.
  await verifyPublicHttpsImage(resolved[0], 0)

  // Soft-check remaining images; failure on #1 already hard-errored above.
  const statuses: Array<{ index: number; ok: boolean; status?: number }> = []
  for (let i = 0; i < resolved.length; i++) {
    try {
      const response = await fetch(resolved[i], {
        method: "HEAD",
        redirect: "follow",
      })
      const ok = response.ok || response.status === 405
      statuses.push({ index: i, ok, status: response.status })
      if (i === 0 && !ok && response.status !== 405) {
        // Retry GET for first image already done in verifyPublicHttpsImage;
        // if we got here HEAD failed oddly — re-verify.
        await verifyPublicHttpsImage(resolved[0], 0)
      }
    } catch {
      statuses.push({ index: i, ok: false })
      if (i === 0) {
        throw new MarketplaceError(
          "The first listing photo is not publicly accessible over HTTPS after upload. Re-upload the photo and try again.",
          "ebay_image_first_inaccessible",
          400
        )
      }
    }
  }

  console.info("[ebay/images] TEMP inventory imageUrls", {
    count: resolved.length,
    statuses,
    urls: resolved.map((url, index) => ({
      index,
      preview: redactUrlForLog(url),
      https: url.startsWith("https://"),
    })),
  })

  return resolved
}
