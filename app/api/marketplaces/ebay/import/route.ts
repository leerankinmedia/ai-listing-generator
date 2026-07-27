import { NextResponse } from "next/server"
import { getEntitlement } from "@/lib/billing/entitlement"
import {
  EBAY_IMPORT_PAGE_SIZE,
  importEbayOffersPage,
  mapEbayImportToListingForEnv,
} from "@/lib/marketplaces/adapters/ebay/import"
import { ensureEbayUserAccessToken } from "@/lib/insights/ebay-auth"
import { upsertSupabaseListingServer } from "@/lib/listings/supabase-repo"
import {
  createServerSupabase,
  getServerAuthUser,
  isSupabaseConfigured,
} from "@/lib/supabase/index"

export const runtime = "nodejs"
export const maxDuration = 300

type ImportBody = {
  offset?: number
  limit?: number
}

/**
 * Paginated eBay Inventory import.
 * Imports one page of active/published offers into ListWise listings each call.
 * Client loops with nextOffset until done=true for progress UI.
 */
export async function POST(request: Request) {
  try {
    const user = await getServerAuthUser()
    if (!user?.id) {
      return NextResponse.json(
        {
          error: "Sign in required to connect a marketplace.",
          code: "unauthorized",
        },
        { status: 401 }
      )
    }

    // Same entitlement path as Billing / eBay OAuth start.
    const entitlement = await getEntitlement(user.id, {
      email: user.email,
      authUser: user,
    })
    const isOwner =
      entitlement.ownerOverride === true || entitlement.status === "owner"
    if (!isOwner && !entitlement.allowed) {
      return NextResponse.json(
        {
          error:
            entitlement.status === "expired"
              ? "Your free trial has expired. Subscribe on the Billing page to continue."
              : "Start your 7-day free trial to unlock this feature.",
          code:
            entitlement.status === "expired"
              ? "trial_expired"
              : "subscription_required",
        },
        { status: 402 }
      )
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Supabase is required to import inventory." },
        { status: 503 }
      )
    }

    const token = await ensureEbayUserAccessToken()
    if (!token.ok) {
      return NextResponse.json(
        { error: token.reason, code: "ebay_not_connected" },
        { status: 400 }
      )
    }

    let body: ImportBody = {}
    try {
      body = (await request.json()) as ImportBody
    } catch {
      body = {}
    }

    const offset =
      typeof body.offset === "number" && Number.isFinite(body.offset)
        ? Math.max(0, Math.floor(body.offset))
        : 0
    const limit =
      typeof body.limit === "number" && Number.isFinite(body.limit)
        ? Math.min(50, Math.max(1, Math.floor(body.limit)))
        : EBAY_IMPORT_PAGE_SIZE

    const page = await importEbayOffersPage(
      token.accessToken,
      offset,
      limit
    )

    const supabase = await createServerSupabase()
    let created = 0
    let updated = 0
    const failures: Array<{ ebayListingId: string; error: string }> = []

    for (const imported of page.imported) {
      const listing = mapEbayImportToListingForEnv({
        userId: user.id,
        imported,
      })
      try {
        const { data: existing } = await supabase
          .from("listings")
          .select("id, created_at")
          .eq("id", listing.id)
          .eq("user_id", user.id)
          .maybeSingle()

        if (existing?.created_at) {
          listing.createdAt = existing.created_at as string
        }

        await upsertSupabaseListingServer(supabase, listing)
        if (existing?.id) updated += 1
        else created += 1
      } catch (error) {
        failures.push({
          ebayListingId: imported.ebayListingId,
          error:
            error instanceof Error ? error.message : "Failed to save listing",
        })
      }
    }

    const processed = created + updated
    const skipped = page.skipped?.length ?? 0
    const errorCount = failures.length + (page.errors?.length ?? 0)
    const totalOffers = page.totalOffers
    const progressPercent =
      totalOffers && totalOffers > 0
        ? Math.min(100, Math.round((page.nextOffset / totalOffers) * 100))
        : page.done
          ? 100
          : null

    return NextResponse.json({
      ok: failures.length === 0,
      done: page.done,
      offset: page.offset,
      nextOffset: page.nextOffset,
      pageSize: page.pageSize,
      scanned: page.scanned,
      activeOnPage: page.activeOnPage,
      totalOffers,
      progressPercent,
      created,
      updated,
      processed,
      imported: processed,
      skipped,
      errors: errorCount,
      failed: failures.length,
      failures,
      skippedItems: page.skipped ?? [],
      warnings: page.warnings,
      message: page.done
        ? `Import complete. ${created} new, ${updated} updated, ${skipped} skipped, ${failures.length} failed.`
        : `Imported page at offset ${page.offset}: ${processed} saved, ${skipped} skipped, ${failures.length} failed.`,
    })
  } catch (error) {
    console.error("[ebay/import] failed", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "eBay inventory import failed.",
        code: "ebay_import_failed",
      },
      { status: 500 }
    )
  }
}
