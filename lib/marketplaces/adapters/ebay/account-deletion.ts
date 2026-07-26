import { createHash } from "crypto"

/**
 * eBay Marketplace Account Deletion challenge response.
 * Hash MUST be SHA-256 of challengeCode + verificationToken + endpointURL
 * concatenated in that exact order (UTF-8), hex digest.
 */
export function buildEbayDeletionChallengeResponse(
  challengeCode: string,
  verificationToken: string,
  endpointUrl: string
): string {
  return createHash("sha256")
    .update(challengeCode, "utf8")
    .update(verificationToken, "utf8")
    .update(endpointUrl, "utf8")
    .digest("hex")
}

export function getEbayDeletionVerificationToken(): string | null {
  const token = process.env.EBAY_DELETION_VERIFICATION_TOKEN?.trim()
  return token || null
}

/** Exact public HTTPS endpoint string used in the challenge hash. */
export function getEbayDeletionEndpointUrl(): string | null {
  const endpoint = process.env.EBAY_DELETION_ENDPOINT?.trim()
  return endpoint || null
}

export type EbayDeletionIdentity = {
  userId?: string | null
  username?: string | null
  eiasToken?: string | null
  notificationId?: string | null
  topic?: string | null
}

/**
 * Extract identity fields from an eBay account-deletion notification body.
 * Callers must not log these values.
 */
export function parseEbayDeletionNotification(
  body: unknown
): EbayDeletionIdentity {
  if (!body || typeof body !== "object") return {}
  const root = body as Record<string, unknown>
  const metadata =
    root.metadata && typeof root.metadata === "object"
      ? (root.metadata as Record<string, unknown>)
      : null
  const notification =
    root.notification && typeof root.notification === "object"
      ? (root.notification as Record<string, unknown>)
      : null
  const data =
    notification?.data && typeof notification.data === "object"
      ? (notification.data as Record<string, unknown>)
      : root.data && typeof root.data === "object"
        ? (root.data as Record<string, unknown>)
        : null

  const str = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null

  return {
    userId: str(data?.userId) || str(data?.userid) || str(data?.user_id),
    username: str(data?.username),
    eiasToken: str(data?.eiasToken) || str(data?.eias_token),
    notificationId: str(notification?.notificationId) || str(root.notificationId),
    topic: str(metadata?.topic) || str(root.topic),
  }
}
