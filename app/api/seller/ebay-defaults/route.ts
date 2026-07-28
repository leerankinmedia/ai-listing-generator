import { NextResponse } from "next/server"
import {
  ebaySellerDefaultsAreReady,
  missingEbaySellerDefaultFields,
  normalizeEbaySellerDefaults,
} from "@/lib/seller/ebay-defaults"
import {
  getSellerPreferences,
  SellerPreferencesError,
  upsertSellerPreferences,
} from "@/lib/seller/seller-preferences-repo"
import { getServerAuthUser } from "@/lib/supabase/index"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function errorResponse(err: unknown) {
  if (err instanceof SellerPreferencesError) {
    return NextResponse.json(
      {
        error: err.message,
        code: err.code,
      },
      { status: err.code === "table_missing" ? 503 : 500 }
    )
  }
  return NextResponse.json(
    {
      error:
        err instanceof Error ? err.message : "Could not save preferences.",
    },
    { status: 500 }
  )
}

export async function GET() {
  const user = await getServerAuthUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  try {
    const row = await getSellerPreferences(user.id)
    if (!row) {
      return NextResponse.json({
        setupCompleted: false,
        defaults: null,
        ready: false,
        missing: ["seller defaults not configured"],
      })
    }

    const missing = missingEbaySellerDefaultFields(row.defaults)
    return NextResponse.json({
      setupCompleted: row.setupCompleted,
      defaults: row.defaults,
      ready: row.setupCompleted && missing.length === 0,
      missing,
    })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function PUT(request: Request) {
  const user = await getServerAuthUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const record = body as { defaults?: unknown; setupCompleted?: boolean }
  const defaults = normalizeEbaySellerDefaults(record.defaults)
  const missing = missingEbaySellerDefaultFields(defaults)
  const setupCompleted =
    record.setupCompleted === true ||
    (record.setupCompleted !== false && missing.length === 0)

  try {
    const saved = await upsertSellerPreferences(
      user.id,
      defaults,
      setupCompleted && missing.length === 0
    )
    return NextResponse.json({
      ok: true,
      setupCompleted: saved.setupCompleted,
      defaults: saved.defaults,
      ready: ebaySellerDefaultsAreReady(saved.defaults) && saved.setupCompleted,
      missing: missingEbaySellerDefaultFields(saved.defaults),
    })
  } catch (err) {
    return errorResponse(err)
  }
}
