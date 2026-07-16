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

export function getConnectionsSecret(): string {
  const secret = process.env.CONNECTIONS_SECRET
  if (!secret || secret.length < 16) {
    throw new Error(
      "CONNECTIONS_SECRET is required (min 16 chars) to store marketplace credentials securely."
    )
  }
  return secret
}

function keyFromSecret(secret: string): Buffer {
  return createHash("sha256").update(secret).digest()
}

export function encryptPayload(plaintext: string, secret = getConnectionsSecret()): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString("base64url")
}

export function decryptPayload(payload: string, secret = getConnectionsSecret()): string {
  const buf = Buffer.from(payload, "base64url")
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const data = buf.subarray(28)
  const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(secret), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
}

export function connectionCookieName(marketplaceId: MarketplaceId): string {
  return `${COOKIE_PREFIX}${marketplaceId}`
}

export function serializeConnection(connection: StoredMarketplaceConnection): string {
  return encryptPayload(JSON.stringify(connection))
}

export function deserializeConnection(
  payload: string
): StoredMarketplaceConnection {
  const parsed = JSON.parse(decryptPayload(payload)) as StoredMarketplaceConnection
  if (!parsed.marketplaceId || !parsed.accessToken) {
    throw new Error("Invalid connection payload")
  }
  return parsed
}

export function isConnectionsCryptoConfigured() {
  return Boolean(process.env.CONNECTIONS_SECRET && process.env.CONNECTIONS_SECRET.length >= 16)
}

export { getAppBaseUrl, resolveRequestAppBaseUrl, PRODUCTION_APP_URL } from "@/lib/app-url"
