import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"
import type { MarketplaceId } from "@/lib/types"

const COOKIE_PREFIX = "lw_mp_"

export type ConnectionAuthMethod = "oauth" | "api_token"

export interface StoredMarketplaceConnection {
  marketplaceId: MarketplaceId
  authMethod: ConnectionAuthMethod
  accessToken: string
  refreshToken?: string
  expiresAt?: string
  accountLabel?: string
  /** Extra secrets (e.g. Vinted signing key) */
  meta?: Record<string, string>
  connectedAt: string
  updatedAt: string
}

/**
 * Stable secret candidates for encrypt/decrypt.
 * Prefer explicit CONNECTIONS_SECRET when set (existing production tokens).
 * Otherwise derive automatically from other secure env vars already present
 * on Vercel so the Founder flow is not blocked by a missing CONNECTIONS_SECRET.
 */
export function resolveConnectionsSecretCandidates(): string[] {
  const out: string[] = []
  const seen = new Set<string>()

  const push = (value: string | undefined | null) => {
    const v = typeof value === "string" ? value.trim() : ""
    if (v.length < 16 || seen.has(v)) return
    seen.add(v)
    out.push(v)
  }

  push(process.env.CONNECTIONS_SECRET)

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (serviceRole && serviceRole.length >= 16) {
    push(
      createHash("sha256")
        .update(`listwise.connections.v1:${serviceRole}`)
        .digest("base64url")
        .slice(0, 43)
    )
  }

  const ebaySecret = process.env.EBAY_CLIENT_SECRET?.trim()
  if (ebaySecret && ebaySecret.length >= 16) {
    push(
      createHash("sha256")
        .update(`listwise.connections.v1:ebay:${ebaySecret}`)
        .digest("base64url")
        .slice(0, 43)
    )
  }

  return out
}

export function getConnectionsSecret(): string {
  const candidates = resolveConnectionsSecretCandidates()
  if (candidates.length === 0) {
    throw new Error(
      "No secure key available to store marketplace credentials. Set CONNECTIONS_SECRET or SUPABASE_SERVICE_ROLE_KEY."
    )
  }
  return candidates[0]
}

function keyFromSecret(secret: string): Buffer {
  return createHash("sha256").update(secret).digest()
}

export function encryptPayload(
  plaintext: string,
  secret = getConnectionsSecret()
): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret), iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString("base64url")
}

export function decryptPayload(
  payload: string,
  secret = getConnectionsSecret()
): string {
  const buf = Buffer.from(payload, "base64url")
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const data = buf.subarray(28)
  const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(secret), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8"
  )
}

/** Try every known secret so existing Supabase rows keep working after env changes. */
export function decryptPayloadWithFallback(payload: string): string {
  const candidates = resolveConnectionsSecretCandidates()
  if (candidates.length === 0) {
    throw new Error("No connections secret candidates configured.")
  }
  // Prefer decryptPayload default (primary secret) first via candidates loop.
  let lastError: unknown
  for (const secret of candidates) {
    try {
      return decryptPayload(payload, secret)
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Could not decrypt marketplace connection payload.")
}

export function connectionCookieName(marketplaceId: MarketplaceId): string {
  return `${COOKIE_PREFIX}${marketplaceId}`
}

export function serializeConnection(
  connection: StoredMarketplaceConnection
): string {
  return encryptPayload(JSON.stringify(connection))
}

export function deserializeConnection(
  payload: string
): StoredMarketplaceConnection {
  const parsed = JSON.parse(
    decryptPayloadWithFallback(payload)
  ) as StoredMarketplaceConnection
  if (!parsed.marketplaceId || !parsed.accessToken) {
    throw new Error("Invalid connection payload")
  }
  return parsed
}

/** True when we can encrypt/decrypt — explicit secret OR auto-derived from secure env. */
export function isConnectionsCryptoConfigured() {
  return resolveConnectionsSecretCandidates().length > 0
}

/** Explicit CONNECTIONS_SECRET only (for diagnostics — not shown to sellers). */
export function hasExplicitConnectionsSecret() {
  const secret = process.env.CONNECTIONS_SECRET?.trim()
  return Boolean(secret && secret.length >= 16)
}

export { getAppBaseUrl, resolveRequestAppBaseUrl, PRODUCTION_APP_URL } from "@/lib/app-url"
