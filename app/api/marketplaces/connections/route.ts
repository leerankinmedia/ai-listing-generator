import { NextResponse } from "next/server"
import type { MarketplaceId } from "@/lib/types"
import { checkMarketplaceConnectionAccess } from "@/lib/billing/access"
import {
  deleteConnection,
  listConnections,
  toPublicConnection,
} from "@/lib/marketplaces/connections/store"
import { isConnectionsCryptoConfigured } from "@/lib/marketplaces/connections/crypto"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Read marketplace connections for the authenticated user from Supabase.
 * Display is not gated on trial/subscription — expired accounts still see
 * Connected status. Connect/disconnect/publish remain access-gated.
 */
export async function GET() {
  // Auto-derived secrets from SUPABASE_SERVICE_ROLE_KEY / EBAY_CLIENT_SECRET count.
  if (!isConnectionsCryptoConfigured()) {
    return NextResponse.json(
      {
        error:
          "Marketplace credential storage is not available on this server.",
        connections: [],
      },
      { status: 503 }
    )
  }

  const user = await getServerAuthUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized.", connections: [] }, { status: 401 })
  }

  const connections = await listConnections()
  return NextResponse.json(
    {
      connections: connections.map(toPublicConnection),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  )
}

export async function DELETE(request: Request) {
  const user = await getServerAuthUser()
  const gate = await checkMarketplaceConnectionAccess(user)
  if (!gate.ok) {
    return NextResponse.json(gate.body, { status: gate.status })
  }

  const { searchParams } = new URL(request.url)
  const marketplaceId = searchParams.get("marketplaceId") as MarketplaceId | null
  if (!marketplaceId) {
    return NextResponse.json(
      { error: "marketplaceId query param is required." },
      { status: 400 }
    )
  }
  await deleteConnection(marketplaceId)
  return NextResponse.json({ ok: true, marketplaceId })
}
