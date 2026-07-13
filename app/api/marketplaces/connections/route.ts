import { NextResponse } from "next/server"
import type { MarketplaceId } from "@/lib/types"
import {
  deleteConnection,
  listConnections,
  toPublicConnection,
} from "@/lib/marketplaces/connections/store"
import { isConnectionsCryptoConfigured } from "@/lib/marketplaces/connections/crypto"

export const runtime = "nodejs"

export async function GET() {
  if (!isConnectionsCryptoConfigured()) {
    return NextResponse.json(
      {
        error:
          "CONNECTIONS_SECRET is required to store marketplace credentials securely.",
        connections: [],
      },
      { status: 503 }
    )
  }

  const connections = await listConnections()
  return NextResponse.json({
    connections: connections.map(toPublicConnection),
  })
}

export async function DELETE(request: Request) {
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
