import { NextResponse } from "next/server"
import {
  getSalesInsights,
  parseInsightsFilters,
} from "@/lib/insights/service"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const user = await getServerAuthUser()
  if (!user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const filters = parseInsightsFilters(searchParams)
  const payload = await getSalesInsights(filters)

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  })
}
