/**
 * Promoted Listings (CPS) — applied after the offer is published.
 * Never report success unless eBay confirms the ad was created.
 */

import { ebayFetch, ebayFetchResult } from "@/lib/marketplaces/adapters/ebay/client"
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"

export type PromotedListingsRequest = {
  mode: "off" | "dynamic" | "custom"
  /** Required for custom; ignored for dynamic. */
  percent?: number | null
}

export type PromotedListingsResult = {
  status: "off" | "applied" | "skipped" | "failed"
  mode?: "dynamic" | "custom"
  percent?: number | null
  message: string
  campaignId?: string
  adId?: string
}

type EbayCampaign = {
  campaignId?: string
  campaignName?: string
  campaignStatus?: string
  fundingStrategy?: {
    fundingModel?: string
    bidPercentage?: string
    adRateStrategy?: string
  }
  marketplaceId?: string
}

function marketplaceId() {
  return process.env.EBAY_MARKETPLACE_ID || "EBAY_US"
}

function logPromo(
  event: string,
  details: Record<string, string | number | boolean | undefined | null>
) {
  console.info(`[ebay/promoted] ${event}`, details)
}

async function listCampaigns(accessToken: string): Promise<EbayCampaign[]> {
  const mp = marketplaceId()
  try {
    const payload = (await ebayFetch(
      `/sell/marketing/v1/ad_campaign?marketplace_id=${encodeURIComponent(mp)}&limit=50`,
      accessToken,
      { method: "GET", step: "getAdCampaigns" }
    )) as { campaigns?: EbayCampaign[] } | null
    return payload?.campaigns || []
  } catch (err) {
    const message = err instanceof Error ? err.message : "list campaigns failed"
    logPromo("list campaigns failed", { message: message.slice(0, 240) })
    return []
  }
}

async function createListWiseCampaign(
  accessToken: string,
  mode: "dynamic" | "custom",
  percent: number
): Promise<string> {
  const start = new Date()
  const name =
    mode === "dynamic"
      ? "ListWise Promoted · Dynamic"
      : `ListWise Promoted · ${percent}%`

  const fundingStrategy: Record<string, unknown> = {
    fundingModel: "COST_PER_SALE",
  }
  if (mode === "dynamic") {
    fundingStrategy.adRateStrategy = "DYNAMIC"
  } else {
    fundingStrategy.adRateStrategy = "FIXED"
    fundingStrategy.bidPercentage = percent.toFixed(1)
  }

  const body = {
    campaignName: name,
    startDate: start.toISOString(),
    marketplaceId: marketplaceId(),
    fundingStrategy,
  }

  const { status, data } = await ebayFetchResult(
    "/sell/marketing/v1/ad_campaign",
    accessToken,
    {
      method: "POST",
      step: "createAdCampaign",
      body: JSON.stringify(body),
    }
  )

  const created = data as EbayCampaign | null
  const campaignId = created?.campaignId
  if (!campaignId) {
    throw new MarketplaceError(
      `eBay did not create a promoted listings campaign (HTTP ${status}).`,
      "ebay_promo_campaign_failed",
      502
    )
  }

  // Launch campaign if still in draft.
  try {
    await ebayFetch(
      `/sell/marketing/v1/ad_campaign/${encodeURIComponent(campaignId)}/launch`,
      accessToken,
      { method: "POST", step: "launchAdCampaign", body: "{}" }
    )
  } catch (err) {
    // Already running is fine.
    const message = err instanceof Error ? err.message : ""
    logPromo("launch campaign note", {
      campaignId,
      message: message.slice(0, 200),
    })
  }

  return campaignId
}

function pickCampaign(
  campaigns: EbayCampaign[],
  mode: "dynamic" | "custom",
  percent: number
): EbayCampaign | undefined {
  const running = campaigns.filter((c) => {
    const status = (c.campaignStatus || "").toUpperCase()
    return status === "RUNNING" || status === "PENDING" || status === "SCHEDULED"
  })
  const listwise = running.filter((c) =>
    (c.campaignName || "").toLowerCase().includes("listwise")
  )
  const pool = listwise.length > 0 ? listwise : running

  if (mode === "dynamic") {
    return pool.find(
      (c) =>
        (c.fundingStrategy?.adRateStrategy || "").toUpperCase() === "DYNAMIC" ||
        (c.campaignName || "").toLowerCase().includes("dynamic")
    )
  }

  return pool.find((c) => {
    const bid = Number(c.fundingStrategy?.bidPercentage)
    return (
      Number.isFinite(bid) && Math.abs(bid - percent) < 0.05
    )
  }) || pool.find(
    (c) => (c.fundingStrategy?.fundingModel || "").toUpperCase() === "COST_PER_SALE"
  )
}

async function createAdForListing(
  accessToken: string,
  campaignId: string,
  listingId: string,
  mode: "dynamic" | "custom",
  percent: number
): Promise<{ adId?: string; ok: boolean; message: string }> {
  const requests: Array<Record<string, unknown>> = [
    {
      listingId,
    },
  ]
  if (mode === "custom") {
    requests[0].bidPercentage = percent.toFixed(1)
  }

  const { status, data } = await ebayFetchResult(
    `/sell/marketing/v1/ad_campaign/${encodeURIComponent(campaignId)}/bulk_create_ads_by_listing_id`,
    accessToken,
    {
      method: "POST",
      step: "bulkCreateAdsByListingId",
      body: JSON.stringify({ requests }),
    }
  )

  const payload = data as {
    responses?: Array<{
      statusCode?: number
      listingId?: string
      adId?: string
      errors?: Array<{ message?: string }>
      href?: string
    }>
  } | null

  const row = payload?.responses?.[0]
  const okStatus =
    row?.statusCode != null
      ? row.statusCode >= 200 && row.statusCode < 300
      : status >= 200 && status < 300

  if (okStatus && (row?.adId || row?.listingId)) {
    return {
      ok: true,
      adId: row.adId,
      message:
        mode === "dynamic"
          ? "Promoted listing applied with dynamic ad rate."
          : `Promoted listing applied at ${percent.toFixed(1)}% ad rate.`,
    }
  }

  const errMsg =
    row?.errors?.map((e) => e.message).filter(Boolean).join("; ") ||
    `eBay did not confirm promoted listing (HTTP ${status}).`

  return { ok: false, message: errMsg }
}

/**
 * Apply Promoted Listings after a listingId exists.
 * Returns an honest result — never claims success without eBay confirmation.
 */
export async function applyEbayPromotedListing(
  accessToken: string,
  listingId: string | null | undefined,
  request: PromotedListingsRequest
): Promise<PromotedListingsResult> {
  if (!request.mode || request.mode === "off") {
    return {
      status: "off",
      message: "Promoted listings off.",
    }
  }

  if (!listingId) {
    return {
      status: "failed",
      mode: request.mode,
      message:
        "Listing published, but eBay did not return a listing ID so promotion could not be applied.",
    }
  }

  const mode = request.mode
  let percent =
    mode === "custom" && request.percent != null
      ? Number(request.percent)
      : 2.0
  if (!Number.isFinite(percent)) percent = 2.0
  percent = Math.max(2, Math.min(100, Number(percent.toFixed(1))))

  try {
    const campaigns = await listCampaigns(accessToken)
    let campaign = pickCampaign(campaigns, mode, percent)
    let campaignId = campaign?.campaignId

    if (!campaignId) {
      campaignId = await createListWiseCampaign(accessToken, mode, percent)
    }

    const ad = await createAdForListing(
      accessToken,
      campaignId,
      listingId,
      mode,
      percent
    )

    if (!ad.ok) {
      logPromo("ad create failed", {
        listingId,
        campaignId,
        message: ad.message.slice(0, 240),
      })
      return {
        status: "failed",
        mode,
        percent: mode === "custom" ? percent : null,
        campaignId,
        message: ad.message,
      }
    }

    logPromo("ad applied", {
      listingId,
      campaignId,
      adId: ad.adId || null,
      mode,
      percent: mode === "custom" ? percent : null,
    })

    return {
      status: "applied",
      mode,
      percent: mode === "custom" ? percent : null,
      campaignId,
      adId: ad.adId,
      message: ad.message,
    }
  } catch (err) {
    const message =
      err instanceof MarketplaceError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Promoted listing request failed."
    logPromo("apply failed", {
      listingId,
      message: message.slice(0, 240),
    })
    return {
      status: "failed",
      mode,
      percent: mode === "custom" ? percent : null,
      message,
    }
  }
}
