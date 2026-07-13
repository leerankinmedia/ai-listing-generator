import { createHash, randomBytes } from "crypto"
import { cookies } from "next/headers"
import {
  encryptPayload,
  decryptPayload,
  isConnectionsCryptoConfigured,
} from "@/lib/marketplaces/connections/crypto"

const OAUTH_STATE_COOKIE = "lw_oauth_state"

export function createOAuthState(marketplaceId: string): string {
  const nonce = randomBytes(16).toString("hex")
  const payload = JSON.stringify({
    marketplaceId,
    nonce,
    createdAt: Date.now(),
  })
  if (isConnectionsCryptoConfigured()) {
    return encryptPayload(payload)
  }
  return Buffer.from(payload).toString("base64url")
}

export async function persistOAuthState(state: string) {
  const jar = await cookies()
  jar.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  })
}

export async function consumeOAuthStateRaw(): Promise<string> {
  const jar = await cookies()
  const cookieState = jar.get(OAUTH_STATE_COOKIE)?.value
  jar.delete(OAUTH_STATE_COOKIE)
  if (!cookieState) {
    throw new Error("Missing OAuth state cookie. Start the connection again.")
  }
  return cookieState
}

export function verifyOAuthState(state: string, expectedMarketplaceId: string) {
  let parsed: { marketplaceId?: string; nonce?: string; createdAt?: number }
  try {
    const json = isConnectionsCryptoConfigured()
      ? decryptPayload(state)
      : Buffer.from(state, "base64url").toString("utf8")
    parsed = JSON.parse(json)
  } catch {
    throw new Error("Invalid OAuth state.")
  }
  if (parsed.marketplaceId !== expectedMarketplaceId) {
    throw new Error("OAuth state marketplace mismatch.")
  }
  if (!parsed.createdAt || Date.now() - parsed.createdAt > 10 * 60 * 1000) {
    throw new Error("OAuth state expired. Start the connection again.")
  }
  return parsed
}

export function assertStateMatches(cookieState: string, queryState: string) {
  const a = createHash("sha256").update(cookieState).digest("hex")
  const b = createHash("sha256").update(queryState).digest("hex")
  if (a !== b) {
    throw new Error("OAuth state mismatch. Possible CSRF — reconnect.")
  }
}
