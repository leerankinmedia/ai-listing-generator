import { NextResponse } from "next/server"
import {
  buildEbayAuthorizeUrl,
  isEbayConfigured,
} from "@/lib/marketplaces/adapters/ebay/oauth"
import { isConnectionsCryptoConfigured } from "@/lib/marketplaces/connections/crypto"
import {
  createOAuthState,
  persistOAuthState,
} from "@/lib/marketplaces/oauth-state"

export const runtime = "nodejs"

export async function GET() {
  try {
    if (!isConnectionsCryptoConfigured()) {
      return NextResponse.json(
        {
          error:
            "CONNECTIONS_SECRET is required before connecting marketplaces.",
        },
        { status: 503 }
      )
    }
    if (!isEbayConfigured()) {
      return NextResponse.json(
        {
          error:
            "eBay is not configured. Set EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_RU_NAME.",
        },
        { status: 503 }
      )
    }

    const state = createOAuthState("ebay")
    await persistOAuthState(state)
    const url = buildEbayAuthorizeUrl(state)
    return NextResponse.redirect(url)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to start eBay OAuth.",
      },
      { status: 500 }
    )
  }
}
