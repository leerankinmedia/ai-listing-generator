import "server-only"
import {
  parseEbayDeletionNotification,
  type EbayDeletionIdentity,
} from "@/lib/marketplaces/adapters/ebay/account-deletion"
import {
  deserializeConnection,
  isConnectionsCryptoConfigured,
} from "@/lib/marketplaces/connections/crypto"
import { createServiceRoleClient } from "@/lib/supabase/index"

export { parseEbayDeletionNotification }

type ConnectionRow = {
  id: string
  user_id: string
  marketplace_id: string
  account_label: string | null
  encrypted_payload: string
  external_user_id: string | null
  external_username: string | null
}

function normalizeUsername(value: string | null | undefined) {
  return value?.trim().toLowerCase() || ""
}

function connectionMatches(
  row: ConnectionRow,
  identity: EbayDeletionIdentity
): boolean {
  const wantUserId = identity.userId?.trim()
  const wantUsername = normalizeUsername(identity.username)
  const wantEias = identity.eiasToken?.trim()

  if (wantUserId && row.external_user_id && row.external_user_id === wantUserId) {
    return true
  }
  if (
    wantUsername &&
    row.external_username &&
    normalizeUsername(row.external_username) === wantUsername
  ) {
    return true
  }
  if (
    wantUsername &&
    row.account_label &&
    normalizeUsername(row.account_label) === wantUsername
  ) {
    return true
  }

  if (!isConnectionsCryptoConfigured()) return false
  try {
    const parsed = deserializeConnection(row.encrypted_payload)
    const meta = parsed.meta || {}
    if (wantUserId && meta.ebayUserId && meta.ebayUserId === wantUserId) {
      return true
    }
    if (
      wantUsername &&
      meta.ebayUsername &&
      normalizeUsername(meta.ebayUsername) === wantUsername
    ) {
      return true
    }
    if (wantEias && meta.ebayEiasToken && meta.ebayEiasToken === wantEias) {
      return true
    }
  } catch {
    // corrupt payload — treat as non-match
  }
  return false
}

/**
 * Delete / anonymize stored eBay marketplace connection rows for the notified user.
 * Uses service role. Does not log tokens or personal identifiers.
 */
export async function processEbayAccountDeletion(
  identity: EbayDeletionIdentity
): Promise<{ matched: number }> {
  const admin = createServiceRoleClient()
  if (!admin) {
    console.error("[ebay/account-deletion] service role unavailable")
    return { matched: 0 }
  }

  if (!identity.userId && !identity.username && !identity.eiasToken) {
    console.info("[ebay/account-deletion] notification missing identity keys", {
      hasNotificationId: Boolean(identity.notificationId),
      topic: identity.topic || null,
    })
    await admin.from("ebay_account_deletion_events").insert({
      notification_id: identity.notificationId,
      topic: identity.topic,
      matched_connections: 0,
      note: "missing_identity",
    })
    return { matched: 0 }
  }

  const { data, error } = await admin
    .from("marketplace_connections")
    .select(
      "id, user_id, marketplace_id, account_label, encrypted_payload, external_user_id, external_username"
    )
    .eq("marketplace_id", "ebay")

  if (error) {
    console.error("[ebay/account-deletion] connection query failed", {
      code: error.code || null,
    })
    throw error
  }

  const rows = (data as ConnectionRow[] | null) || []
  const matches = rows.filter((row) => connectionMatches(row, identity))
  const ids = matches.map((row) => row.id)

  if (ids.length > 0) {
    const { error: deleteError } = await admin
      .from("marketplace_connections")
      .delete()
      .in("id", ids)
    if (deleteError) {
      console.error("[ebay/account-deletion] delete failed", {
        code: deleteError.code || null,
        matched: ids.length,
      })
      throw deleteError
    }
  }

  await admin.from("ebay_account_deletion_events").insert({
    notification_id: identity.notificationId,
    topic: identity.topic,
    matched_connections: ids.length,
    note: ids.length > 0 ? "deleted_connections" : "no_match",
  })

  console.info("[ebay/account-deletion] processed", {
    matched: ids.length,
    hasNotificationId: Boolean(identity.notificationId),
    topic: identity.topic || null,
  })

  return { matched: ids.length }
}
