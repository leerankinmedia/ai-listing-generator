import { MarketplaceError } from "@/lib/marketplaces/adapters/types"

function ebayMediaBase() {
  // Media API uses apim host in production docs; sandbox mirrors api.sandbox.
  return process.env.EBAY_ENV === "sandbox"
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

export async function resolveEbayImageUrls(
  accessToken: string,
  urls: string[]
): Promise<string[]> {
  const resolved: string[] = []
  for (const url of urls.slice(0, 24)) {
    resolved.push(await uploadEbayImage(accessToken, url))
  }
  if (resolved.length === 0) {
    throw new MarketplaceError(
      "At least one listing photo is required to publish on eBay.",
      "ebay_images_required",
      400
    )
  }
  return resolved
}
