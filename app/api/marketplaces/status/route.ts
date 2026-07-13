import { NextResponse } from "next/server"
import { getAdapterMeta } from "@/lib/marketplaces/adapters/registry"
import { isEbayConfigured } from "@/lib/marketplaces/adapters/ebay/oauth"
import { isWhatnotConfigured } from "@/lib/marketplaces/adapters/whatnot/oauth"
import { isConnectionsCryptoConfigured } from "@/lib/marketplaces/connections/crypto"

export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json({
    connectionsSecretConfigured: isConnectionsCryptoConfigured(),
    ebayConfigured: isEbayConfigured(),
    vintedConfigured: isConnectionsCryptoConfigured(),
    whatnotConfigured: isWhatnotConfigured(),
    adapters: getAdapterMeta(),
  })
}
