import "server-only"
import { refreshEbayToken } from "@/lib/marketplaces/adapters/ebay/oauth"
import type { StoredMarketplaceConnection } from "@/lib/marketplaces/connections/crypto"
import {
  getConnection,
  saveConnection,
} from "@/lib/marketplaces/connections/store"

/** Refresh the stored eBay user token when near expiry. */
export async function ensureEbayUserAccessToken(): Promise<
  | { ok: true; accessToken: string; connection: StoredMarketplaceConnection }
  | { ok: false; reason: string }
> {
  const connection = await getConnection("ebay")
  if (!connection?.accessToken) {
    return {
      ok: false,
      reason: "Connect your eBay account to load Sales Insights.",
    }
  }

  const expires = connection.expiresAt ? Date.parse(connection.expiresAt) : NaN
  const freshEnough =
    Number.isFinite(expires) && expires - Date.now() > 60_000

  if (freshEnough) {
    return { ok: true, accessToken: connection.accessToken, connection }
  }

  if (!connection.refreshToken) {
    return {
      ok: false,
      reason: "eBay access expired. Reconnect eBay on Connections.",
    }
  }

  try {
    const refreshed = await refreshEbayToken(connection.refreshToken)
    const next: StoredMarketplaceConnection = {
      ...connection,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await saveConnection(next)
    return { ok: true, accessToken: next.accessToken, connection: next }
  } catch (error) {
    console.error("[insights/ebay-auth] refresh failed", error)
    return {
      ok: false,
      reason: "Could not refresh eBay access. Reconnect eBay on Connections.",
    }
  }
}
