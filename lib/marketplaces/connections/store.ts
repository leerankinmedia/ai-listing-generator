import { cookies } from "next/headers"
import type { MarketplaceId } from "@/lib/types"
import {
  connectionCookieName,
  deserializeConnection,
  isConnectionsCryptoConfigured,
  serializeConnection,
  type StoredMarketplaceConnection,
} from "@/lib/marketplaces/connections/crypto"

export const PHASE5_MARKETPLACES = ["ebay", "vinted", "whatnot"] as const
export type Phase5MarketplaceId = (typeof PHASE5_MARKETPLACES)[number]

export function isPhase5Marketplace(
  id: MarketplaceId
): id is Phase5MarketplaceId {
  return (PHASE5_MARKETPLACES as readonly string[]).includes(id)
}

export async function saveConnection(
  connection: StoredMarketplaceConnection
): Promise<void> {
  if (!isConnectionsCryptoConfigured()) {
    throw new Error("CONNECTIONS_SECRET is not configured.")
  }
  const jar = await cookies()
  const value = serializeConnection({
    ...connection,
    updatedAt: new Date().toISOString(),
  })
  jar.set(connectionCookieName(connection.marketplaceId), value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  })
}

export async function getConnection(
  marketplaceId: MarketplaceId
): Promise<StoredMarketplaceConnection | null> {
  if (!isConnectionsCryptoConfigured()) return null
  const jar = await cookies()
  const raw = jar.get(connectionCookieName(marketplaceId))?.value
  if (!raw) return null
  try {
    return deserializeConnection(raw)
  } catch {
    return null
  }
}

export async function deleteConnection(marketplaceId: MarketplaceId): Promise<void> {
  const jar = await cookies()
  jar.delete(connectionCookieName(marketplaceId))
}

export async function listConnections(): Promise<StoredMarketplaceConnection[]> {
  const results: StoredMarketplaceConnection[] = []
  for (const id of PHASE5_MARKETPLACES) {
    const conn = await getConnection(id)
    if (conn) results.push(conn)
  }
  return results
}

export function toPublicConnection(connection: StoredMarketplaceConnection) {
  return {
    marketplaceId: connection.marketplaceId,
    authMethod: connection.authMethod,
    accountLabel: connection.accountLabel ?? null,
    connectedAt: connection.connectedAt,
    updatedAt: connection.updatedAt,
    expiresAt: connection.expiresAt ?? null,
    connected: true,
  }
}
