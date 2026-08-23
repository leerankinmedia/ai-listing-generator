/**
 * Publish-path checkpoints and JSON error payload.
 * Used so /api/listings/publish never depends on Next.js HTML error pages.
 */
import { MarketplaceError } from "@/lib/marketplaces/adapters/types"

export const PUBLISH_STAGES = [
  "request/auth",
  "listing_load",
  "image_normalization",
  "image_urls",
  "policy_resolution",
  "inventory_item",
  "offer_create",
  "publish_offer",
  "post_publish_save",
] as const

export type PublishStage = (typeof PUBLISH_STAGES)[number]

const STAGE_ALIASES: Record<string, PublishStage> = {
  publish_request: "request/auth",
  image_preparation: "image_normalization",
  fulfillment_policy: "policy_resolution",
  offer: "offer_create",
}

export type PublishTrace = {
  stage: PublishStage
  details: Record<string, unknown>
}

let trace: PublishTrace = { stage: "request/auth", details: {} }

export function resetPublishTrace() {
  trace = { stage: "request/auth", details: {} }
}

export function checkpoint(
  stage: PublishStage | keyof typeof STAGE_ALIASES,
  details: Record<string, unknown> = {}
) {
  const mapped = (STAGE_ALIASES[stage] || stage) as PublishStage
  const safeDetails: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(details)) {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      safeDetails[key] = value
    } else if (Array.isArray(value)) {
      safeDetails[key] = value.length
    }
  }
  trace = { stage: mapped, details: safeDetails }
  console.info("[publish-stage]", { stage: mapped, ...safeDetails })
}

export function currentPublishTrace(): PublishTrace {
  return trace
}

export function errorMessageOf(error: unknown): string {
  if (error instanceof MarketplaceError) return sanitizePublishErrorMessage(error.message)
  if (error instanceof Error && error.message.trim()) {
    return sanitizePublishErrorMessage(error.message)
  }
  return "Publish failed."
}

/**
 * Sharp's linux-x64 load failure includes a multi-page "Possible solutions"
 * dump (npm install --os=linux, optional platform packages, etc.). Never send
 * that to the ListWise UI. Full error stays in server logs.
 */
export function sanitizePublishErrorMessage(message: string): string {
  const dump =
    /Possible solutions:|npm install --os=|npm install --include=optional|Ensure optional dependencies|platform-specific dependencies|linux-x64 runtime|ERR_DLOPEN_FAILED|libvips-cpp\.so/i.test(
      message
    )
  if (dump) {
    return "Could not bake ListWise-preview pixels for eBay. The image converter failed to load on this server, so photos were not sent."
  }
  return message
}

export function publishFailureBody(error: unknown): {
  error: string
  stage: PublishStage
  details: Record<string, unknown>
} {
  const message = errorMessageOf(error)
  return {
    error: message,
    stage: trace.stage,
    details: {
      ...trace.details,
      name: error instanceof Error ? error.name : typeof error,
      code: error instanceof MarketplaceError ? error.code : undefined,
    },
  }
}
