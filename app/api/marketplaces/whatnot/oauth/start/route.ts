import { NextResponse } from "next/server"
import {
  buildWhatnotAuthorizeUrl,
  isWhatnotConfigured,
} from "@/lib/marketplaces/adapters/whatnot/oauth"
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
    if (!isWhatnotConfigured()) {
      return NextResponse.json(
        {
          error:
            "Whatnot is not configured. Set WHATNOT_CLIENT_ID and WHATNOT_CLIENT_SECRET.",
        },
        { status: 503 }
      )
    }

    const state = createOAuthState("whatnot")
    await persistOAuthState(state)
    const url = buildWhatnotAuthorizeUrl(state)
    return NextResponse.redirect(url)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to start Whatnot OAuth.",
      },
      { status: 500 }
    )
  }
}
