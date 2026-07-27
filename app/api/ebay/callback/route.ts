import { NextRequest } from "next/server"
import { handleEbayOAuthCallback } from "@/lib/marketplaces/adapters/ebay/oauth-callback"

export const runtime = "nodejs"

/** Production eBay Auth Accepted URL: /api/ebay/callback */
export async function GET(request: NextRequest) {
  return handleEbayOAuthCallback(request)
}
