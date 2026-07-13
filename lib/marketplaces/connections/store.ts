import { cookies } from "next/headers"
import type { MarketplaceId } from "@/lib/types"
import {
  connectionCookieName,
  deserializeConnection,
  isConnectionsCryptoConfigured,
  serializeConnection,
  type StoredMarketplaceConnection,
} from "@/lib/marketplaces/connections/crypto"
import { getServerAuthUser, isSupabaseConfigured } from "@/lib/supabase/index"
import { createClient as createServerClient } from "@/lib/supabase/server"

export const PHASE5_MARKETPLACES = ["ebay", "vinted", "whatnot"] as const
export type Phase5MarketplaceId = (typeof PHASE5_MARKETPLACES)[number]

export function isPhase5Marketplace(
  id: MarketplaceId
): id is Phase5MarketplaceId {
  return (PHASE5_MARKETPLACES as readonly string[]).includes(id)
}

type ConnectionRow = {
  marketplace_id: string
  auth_method: "oauth" | "api_token"
  account_label: string | null
  encrypted_payload: string
  expires_at: string | null
  connected_at: string
  updated_at: string
}

async function saveCookieConnection(connection: StoredMarketplaceConnection) {
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

async function getCookieConnection(
  marketplaceId: MarketplaceId
): Promise<StoredMarketplaceConnection | null> {
  const jar = await cookies()
  const raw = jar.get(connectionCookieName(marketplaceId))?.value
  if (!raw) return null
  try {
    return deserializeConnection(raw)
  } catch {
    return null
  }
}

async function deleteCookieConnection(marketplaceId: MarketplaceId) {
  const jar = await cookies()
  jar.delete(connectionCookieName(marketplaceId))
}

/**
 * Persist marketplace credentials.
 * Prefer Supabase `marketplace_connections` when the user is authenticated;
 * fall back to encrypted httpOnly cookies (demo / no-session).
 */
export async function saveConnection(
  connection: StoredMarketplaceConnection
): Promise<void> {
  if (!isConnectionsCryptoConfigured()) {
    throw new Error("CONNECTIONS_SECRET is not configured.")
  }

  const updated: StoredMarketplaceConnection = {
    ...connection,
    updatedAt: new Date().toISOString(),
  }
  const encryptedPayload = serializeConnection(updated)

  const user = await getServerAuthUser()
  if (user && isSupabaseConfigured()) {
    const supabase = await createServerClient()
    const { error } = await supabase.from("marketplace_connections").upsert(
      {
        user_id: user.id,
        marketplace_id: updated.marketplaceId,
        auth_method: updated.authMethod,
        account_label: updated.accountLabel ?? null,
        encrypted_payload: encryptedPayload,
        expires_at: updated.expiresAt ?? null,
        connected_at: updated.connectedAt,
        updated_at: updated.updatedAt,
      },
      { onConflict: "user_id,marketplace_id" }
    )
    if (error) throw error
    // Keep cookie mirror for same-browser publish calls without re-fetch races
    await saveCookieConnection(updated)
    return
  }

  await saveCookieConnection(updated)
}

export async function getConnection(
  marketplaceId: MarketplaceId
): Promise<StoredMarketplaceConnection | null> {
  if (!isConnectionsCryptoConfigured()) return null

  const user = await getServerAuthUser()
  if (user && isSupabaseConfigured()) {
    const supabase = await createServerClient()
    const { data, error } = await supabase
      .from("marketplace_connections")
      .select(
        "marketplace_id, auth_method, account_label, encrypted_payload, expires_at, connected_at, updated_at"
      )
      .eq("user_id", user.id)
      .eq("marketplace_id", marketplaceId)
      .maybeSingle()
    if (error) throw error
    if (data) {
      try {
        return deserializeConnection((data as ConnectionRow).encrypted_payload)
      } catch {
        return null
      }
    }
  }

  return getCookieConnection(marketplaceId)
}

export async function deleteConnection(marketplaceId: MarketplaceId): Promise<void> {
  const user = await getServerAuthUser()
  if (user && isSupabaseConfigured()) {
    const supabase = await createServerClient()
    const { error } = await supabase
      .from("marketplace_connections")
      .delete()
      .eq("user_id", user.id)
      .eq("marketplace_id", marketplaceId)
    if (error) throw error
  }
  await deleteCookieConnection(marketplaceId)
}

export async function listConnections(): Promise<StoredMarketplaceConnection[]> {
  const user = await getServerAuthUser()
  if (user && isSupabaseConfigured() && isConnectionsCryptoConfigured()) {
    const supabase = await createServerClient()
    const { data, error } = await supabase
      .from("marketplace_connections")
      .select(
        "marketplace_id, auth_method, account_label, encrypted_payload, expires_at, connected_at, updated_at"
      )
      .eq("user_id", user.id)
    if (error) throw error
    const results: StoredMarketplaceConnection[] = []
    for (const row of (data as ConnectionRow[] | null) ?? []) {
      try {
        results.push(deserializeConnection(row.encrypted_payload))
      } catch {
        // skip corrupt rows
      }
    }
    if (results.length > 0) return results
  }

  const results: StoredMarketplaceConnection[] = []
  for (const id of PHASE5_MARKETPLACES) {
    const conn = await getCookieConnection(id)
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
